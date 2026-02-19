const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public', {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

const SALT = 'sky-crash-provably-fair-v1';

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

app.post('/api/game/tick', (req, res) => {
  if (!gameState.currentRound || gameState.currentRound.status !== 'flying') {
    return res.json({ status: 'idle', crashed: false });
  }

  const elapsed = (Date.now() - gameState.currentRound.startTime) / 1000;
  const currentMultiplier = Math.pow(Math.E, 0.07 * elapsed);
  const mult = Math.floor(currentMultiplier * 100) / 100;

  if (mult >= gameState.currentRound.crashPoint) {
    gameState.currentRound.status = 'crashed';
    const round = { ...gameState.currentRound };

    gameState.history.unshift({
      id: round.id,
      crashPoint: round.crashPoint,
      hash: round.hash,
      commitment: round.commitment
    });
    if (gameState.history.length > 50) gameState.history.pop();

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

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Crash game server running on port ${PORT}`);
});
