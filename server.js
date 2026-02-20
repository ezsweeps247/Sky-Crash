const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public', {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

const PORT = process.env.PORT || 5000;
const SALT = 'sky-crash-provably-fair-v1';

let db = null;

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL found - running without database (in-memory only)');
    return;
  }

  try {
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await db.query(`
      CREATE TABLE IF NOT EXISTS game_history (
        id SERIAL PRIMARY KEY,
        round_id VARCHAR(50) UNIQUE NOT NULL,
        crash_point DECIMAL(10,2) NOT NULL,
        hash VARCHAR(64) NOT NULL,
        commitment VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Database connected and tables ready (Neon)');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.log('Falling back to in-memory mode');
    db = null;
  }
}

const gameState = {
  currentRound: null,
  history: [],
  hashChain: [],
  chainIndex: 0,
  serverSeed: null,
  chainHead: null
};

function generateHashChain(seed, length = 10000) {
  const chain = [];
  let currentHash = seed;
  for (let i = 0; i < length; i++) {
    currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    chain.push(currentHash);
  }
  chain.reverse();
  return chain;
}

function hashToCrashPoint(hash) {
  const hmac = crypto.createHmac('sha256', hash);
  hmac.update(SALT);
  const hex = hmac.digest('hex');
  const divisor = parseInt(hex.slice(0, 8), 16);
  const crashPoint = Math.max(1.00, (Math.pow(2, 32) / (divisor + 1)) * 0.97);
  return Math.floor(crashPoint * 100) / 100;
}

function initializeGame() {
  gameState.serverSeed = crypto.randomBytes(32).toString('hex');
  gameState.hashChain = generateHashChain(gameState.serverSeed, 10000);
  gameState.chainIndex = 0;
  gameState.chainHead = gameState.hashChain[0];
}

async function saveRoundToDb(round) {
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO game_history (round_id, crash_point, hash, commitment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (round_id) DO NOTHING`,
      [round.id, round.crashPoint, round.hash, round.commitment]
    );
  } catch (err) {
    console.error('Failed to save round to DB:', err.message);
  }
}

async function loadHistoryFromDb() {
  if (!db) return;
  try {
    const result = await db.query(
      `SELECT round_id as id, crash_point as "crashPoint", hash, commitment
       FROM game_history ORDER BY created_at DESC LIMIT 50`
    );
    gameState.history = result.rows.map(r => ({
      ...r,
      crashPoint: parseFloat(r.crashPoint)
    }));
  } catch (err) {
    console.error('Failed to load history from DB:', err.message);
  }
}

initializeGame();

app.get('/api/game/seed', (req, res) => {
  res.json({
    chainHead: gameState.chainHead,
    salt: SALT,
    info: 'Each round hash is the next in a SHA-256 chain. Verify: SHA256(round_hash) === previous_round_hash. Crash = HMAC-SHA256(round_hash, salt), first 8 hex chars to int, crashPoint = max(1.00, (2^32 / (int+1)) * 0.97)'
  });
});

app.get('/api/game/new', (req, res) => {
  const hash = gameState.hashChain[gameState.chainIndex];
  const crashPoint = hashToCrashPoint(hash);
  const commitment = crypto.createHash('sha256').update(hash).digest('hex');

  gameState.chainIndex++;
  if (gameState.chainIndex >= gameState.hashChain.length) {
    initializeGame();
  }

  gameState.currentRound = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    hash: hash,
    commitment: commitment,
    crashPoint: crashPoint,
    startTime: null,
    status: 'betting',
    cashedOut: false,
    cashoutMultiplier: null
  };

  res.json({
    roundId: gameState.currentRound.id,
    commitment: commitment,
    status: 'betting'
  });
});

app.post('/api/game/start', (req, res) => {
  if (!gameState.currentRound) {
    return res.status(400).json({ error: 'No active round' });
  }
  gameState.currentRound.status = 'flying';
  gameState.currentRound.startTime = Date.now();
  res.json({
    roundId: gameState.currentRound.id,
    status: 'flying',
    startTime: gameState.currentRound.startTime
  });
});

app.post('/api/game/tick', async (req, res) => {
  if (!gameState.currentRound || gameState.currentRound.status !== 'flying') {
    return res.json({ status: 'idle', crashed: false });
  }

  const elapsed = (Date.now() - gameState.currentRound.startTime) / 1000;
  const currentMultiplier = Math.pow(Math.E, 0.07 * elapsed);
  const mult = Math.floor(currentMultiplier * 100) / 100;

  if (mult >= gameState.currentRound.crashPoint) {
    gameState.currentRound.status = 'crashed';
    const round = { ...gameState.currentRound };

    const historyEntry = {
      id: round.id,
      crashPoint: round.crashPoint,
      hash: round.hash,
      commitment: round.commitment
    };

    gameState.history.unshift(historyEntry);
    if (gameState.history.length > 50) gameState.history.pop();

    await saveRoundToDb(round);

    gameState.currentRound = null;

    return res.json({
      status: 'crashed',
      crashed: true,
      crashPoint: round.crashPoint,
      hash: round.hash,
      commitment: round.commitment,
      roundId: round.id,
      multiplier: mult
    });
  }

  res.json({
    status: 'flying',
    crashed: false,
    multiplier: mult
  });
});

app.post('/api/game/cashout', (req, res) => {
  const { betAmount } = req.body;
  if (!gameState.currentRound || gameState.currentRound.status !== 'flying') {
    return res.json({ success: false, message: 'Cannot cash out now' });
  }

  const elapsed = (Date.now() - gameState.currentRound.startTime) / 1000;
  const currentMultiplier = Math.pow(Math.E, 0.07 * elapsed);
  const mult = Math.floor(currentMultiplier * 100) / 100;

  if (mult >= gameState.currentRound.crashPoint) {
    return res.json({ success: false, message: 'Too late! Plane crashed.' });
  }

  gameState.currentRound.cashedOut = true;
  gameState.currentRound.cashoutMultiplier = mult;

  const winnings = betAmount * mult;
  res.json({
    success: true,
    multiplier: mult,
    winnings: Math.floor(winnings * 100) / 100
  });
});

app.get('/api/game/verify/:hash', (req, res) => {
  const hash = req.params.hash;
  const crashPoint = hashToCrashPoint(hash);
  const chainNext = crypto.createHash('sha256').update(hash).digest('hex');
  res.json({
    hash,
    crashPoint,
    commitment: chainNext,
    salt: SALT,
    howToVerify: 'SHA256(hash) should match the commitment shown before the round. crashPoint = max(1.00, (2^32 / (parseInt(HMAC-SHA256(hash, salt).slice(0,8), 16) + 1)) * 0.97)'
  });
});

app.get('/api/game/history', (req, res) => {
  res.json(gameState.history);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function startServer() {
  await initDatabase();
  await loadHistoryFromDb();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Crash game server running on port ${PORT}`);
  });
}

startServer();
