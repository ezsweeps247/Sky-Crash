let scene, camera, renderer, airplane, cityModels = [];
let engineSound, explosionSound;
let gameLoop = null;
let currentMultiplier = 1.00;
let crashPoint = 0;
let gameState = 'idle';
let balance = 1000.00;
let currentBet = 0;
let roundCommitment = '';
let cashedOut = false;
let startTime = 0;
let airplaneBaseY = 2;
let airplaneTargetBank = 0;
let airplaneCurrentBank = 0;
let cameraShake = 0;
let particles = [];
let smokeParticles = [];
let cityGroup;
let tickPending = false;

function init3D() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060618);
  scene.fog = new THREE.FogExp2(0x060618, 0.008);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 4, 12);
  camera.lookAt(0, 2, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const ambientLight = new THREE.AmbientLight(0x1a1a3e, 0.6);
  scene.add(ambientLight);

  const moonLight = new THREE.DirectionalLight(0x6677aa, 0.8);
  moonLight.position.set(20, 30, -10);
  moonLight.castShadow = true;
  scene.add(moonLight);

  const cityGlow = new THREE.PointLight(0x00f0ff, 1.5, 100);
  cityGlow.position.set(0, -5, -20);
  scene.add(cityGlow);

  const warmGlow = new THREE.PointLight(0xff6600, 0.5, 60);
  warmGlow.position.set(-10, 5, -15);
  scene.add(warmGlow);

  createStarField();
  loadModels();
  createProceduralCity();

  window.addEventListener('resize', onWindowResize);
  animate();
}

function createStarField() {
  const starsGeometry = new THREE.BufferGeometry();
  const starCount = 2000;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 400;
    positions[i * 3 + 1] = Math.random() * 150 + 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 400 - 50;
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  scene.add(new THREE.Points(starsGeometry, starsMaterial));
}

function createProceduralCity() {
  cityGroup = new THREE.Group();

  const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, emissive: 0x0a0a15, roughness: 0.8, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0x16213e, emissive: 0x080818, roughness: 0.7, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0x0f3460, emissive: 0x050520, roughness: 0.6, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x1a1a3e, emissive: 0x0a0a20, roughness: 0.7, metalness: 0.3 })
  ];

  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 20; i++) {
      const width = 1.5 + Math.random() * 3;
      const height = 3 + Math.random() * 15;
      const depth = 1.5 + Math.random() * 3;
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)].clone();
      const building = new THREE.Mesh(geometry, material);

      const x = (i - 10) * 4 + (Math.random() - 0.5) * 2;
      const z = -15 - row * 10 + (Math.random() - 0.5) * 4;
      building.position.set(x, height / 2 - 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      cityGroup.add(building);

      addWindowLights(building, width, height, depth, x, z);
    }
  }

  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 12; i++) {
      const width = 1 + Math.random() * 2.5;
      const height = 5 + Math.random() * 20;
      const depth = 1 + Math.random() * 2.5;
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)].clone();
      const building = new THREE.Mesh(geometry, material);

      const x = side === 0 ? -12 - Math.random() * 8 : 12 + Math.random() * 8;
      const z = -5 - i * 6 + (Math.random() - 0.5) * 3;
      building.position.set(x, height / 2 - 2, z);
      building.castShadow = true;
      cityGroup.add(building);

      addWindowLights(building, width, height, depth, x, z);
    }
  }

  scene.add(cityGroup);
}

function addWindowLights(building, bWidth, bHeight, bDepth, bx, bz) {
  const windowSize = 0.15;
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
  const windowMatBlue = new THREE.MeshBasicMaterial({ color: 0x44aaff });
  const windowGeom = new THREE.PlaneGeometry(windowSize, windowSize * 1.5);

  const floors = Math.floor(bHeight / 1.2);
  const cols = Math.floor(bWidth / 0.8);

  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.4) continue;
      const mat = Math.random() > 0.3 ? windowMat : windowMatBlue;
      const win = new THREE.Mesh(windowGeom, mat);
      const wx = (c - cols / 2) * 0.8 + 0.4;
      const wy = f * 1.2 - bHeight / 2 + 1;
      if (Math.random() > 0.5) {
        win.position.set(bx + wx, wy + bHeight / 2 - 1, bz + bDepth / 2 + 0.01);
      } else {
        win.position.set(bx + wx, wy + bHeight / 2 - 1, bz - bDepth / 2 - 0.01);
        win.rotation.y = Math.PI;
      }
      cityGroup.add(win);
    }
  }
}

function loadModels() {
  const loader = new THREE.GLTFLoader();

  loader.load('/models/airplane/scene.gltf', (gltf) => {
    airplane = gltf.scene;
    airplane.scale.set(0.15, 0.15, 0.15);
    airplane.position.set(0, airplaneBaseY, 0);
    airplane.rotation.y = Math.PI;

    airplane.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const engineGlow = new THREE.PointLight(0xff4400, 0.5, 5);
    engineGlow.position.set(0, 0, -3);
    airplane.add(engineGlow);

    const navLightLeft = new THREE.PointLight(0xff0000, 0.3, 3);
    navLightLeft.position.set(-5, 0, 0);
    airplane.add(navLightLeft);

    const navLightRight = new THREE.PointLight(0x00ff00, 0.3, 3);
    navLightRight.position.set(5, 0, 0);
    airplane.add(navLightRight);

    scene.add(airplane);
  }, undefined, (error) => {
    console.warn('Could not load airplane GLTF, using fallback');
    createFallbackAirplane();
  });

  loader.load('/models/city/scene.gltf', (gltf) => {
    const cityModel = gltf.scene;
    cityModel.scale.set(0.8, 0.8, 0.8);
    cityModel.position.set(0, -8, -40);
    cityModel.traverse((child) => {
      if (child.isMesh) { child.receiveShadow = true; }
    });
    scene.add(cityModel);
    cityModels.push(cityModel);

    const cityModel2 = cityModel.clone();
    cityModel2.position.set(30, -8, -50);
    cityModel2.rotation.y = Math.PI * 0.5;
    scene.add(cityModel2);
    cityModels.push(cityModel2);

    const cityModel3 = cityModel.clone();
    cityModel3.position.set(-30, -8, -45);
    cityModel3.rotation.y = -Math.PI * 0.3;
    scene.add(cityModel3);
    cityModels.push(cityModel3);
  }, undefined, (error) => {
    console.warn('Could not load city GLTF model');
  });
}

function createFallbackAirplane() {
  airplane = new THREE.Group();

  const bodyGeom = new THREE.CylinderGeometry(0.3, 0.25, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.rotation.z = Math.PI / 2;
  airplane.add(body);

  const wingGeom = new THREE.BoxGeometry(0.1, 3.5, 0.8);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.5, roughness: 0.4 });
  const wings = new THREE.Mesh(wingGeom, wingMat);
  airplane.add(wings);

  const tailGeom = new THREE.BoxGeometry(0.05, 1.2, 0.5);
  const tail = new THREE.Mesh(tailGeom, wingMat);
  tail.position.set(-1.8, 0.5, 0);
  airplane.add(tail);

  airplane.position.set(0, airplaneBaseY, 0);
  airplane.scale.set(1.5, 1.5, 1.5);
  scene.add(airplane);
}

function initAudio() {
  engineSound = new Audio('/sounds/engine.wav');
  engineSound.loop = true;
  engineSound.volume = 0.15;

  explosionSound = new Audio('/sounds/explosion.flac');
  explosionSound.volume = 0.5;
}

function playEngineSound() {
  if (engineSound) {
    engineSound.currentTime = 0;
    engineSound.play().catch(() => {});
  }
}

function stopEngineSound() {
  if (engineSound) {
    engineSound.pause();
    engineSound.currentTime = 0;
  }
}

function playExplosionSound() {
  if (explosionSound) {
    explosionSound.currentTime = 0;
    explosionSound.play().catch(() => {});
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createExplosionParticles(position) {
  const colors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xff2200];
  for (let i = 0; i < 40; i++) {
    const geometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.2, 4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true,
      opacity: 1
    });
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.3) * 0.4,
      (Math.random() - 0.5) * 0.5
    );
    particle.userData.life = 1.0;
    particle.userData.decay = 0.01 + Math.random() * 0.02;
    scene.add(particle);
    particles.push(particle);
  }

  for (let i = 0; i < 20; i++) {
    const geometry = new THREE.SphereGeometry(0.2 + Math.random() * 0.4, 6, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.6
    });
    const smoke = new THREE.Mesh(geometry, material);
    smoke.position.copy(position);
    smoke.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      Math.random() * 0.15 + 0.05,
      (Math.random() - 0.5) * 0.2
    );
    smoke.userData.life = 1.0;
    smoke.userData.decay = 0.005 + Math.random() * 0.01;
    scene.add(smoke);
    smokeParticles.push(smoke);
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.position.add(p.userData.velocity);
    p.userData.velocity.y -= 0.005;
    p.userData.life -= p.userData.decay;
    p.material.opacity = p.userData.life;
    p.scale.multiplyScalar(0.98);
    if (p.userData.life <= 0) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      particles.splice(i, 1);
    }
  }

  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const p = smokeParticles[i];
    p.position.add(p.userData.velocity);
    p.userData.life -= p.userData.decay;
    p.material.opacity = p.userData.life * 0.6;
    p.scale.multiplyScalar(1.01);
    if (p.userData.life <= 0) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      smokeParticles.splice(i, 1);
    }
  }
}

let animTime = 0;
function animate() {
  requestAnimationFrame(animate);
  animTime += 0.016;

  if (airplane) {
    if (gameState === 'flying') {
      const flyTime = (Date.now() - startTime) / 1000;
      const bobAmount = Math.sin(flyTime * 1.5) * 0.3;
      const heightGain = Math.min(flyTime * 0.15, 3);
      airplane.position.y = airplaneBaseY + bobAmount + heightGain;

      const bankOsc = Math.sin(flyTime * 0.7) * 0.15;
      airplaneTargetBank = bankOsc;
      airplaneCurrentBank += (airplaneTargetBank - airplaneCurrentBank) * 0.05;
      airplane.rotation.z = airplaneCurrentBank;

      const pitchOsc = Math.sin(flyTime * 0.5) * 0.05 - 0.05;
      airplane.rotation.x = pitchOsc;

      const moveX = Math.sin(flyTime * 0.4) * 3;
      airplane.position.x += (moveX - airplane.position.x) * 0.02;

      const moveZ = Math.sin(flyTime * 0.3) * 2;
      airplane.position.z = moveZ;
    } else if (gameState === 'crashed') {
      if (airplane.position.y > -5) {
        airplane.position.y -= 0.1;
        airplane.rotation.x += 0.02;
        airplane.rotation.z += 0.03;
      }
    } else {
      airplane.position.y = airplaneBaseY + Math.sin(animTime * 0.8) * 0.15;
      airplane.rotation.z = Math.sin(animTime * 0.5) * 0.02;
      airplane.rotation.x = 0;
      airplane.position.x += (0 - airplane.position.x) * 0.02;
      airplane.position.z += (0 - airplane.position.z) * 0.02;
    }
  }

  if (cameraShake > 0) {
    camera.position.x = (Math.random() - 0.5) * cameraShake;
    camera.position.y = 4 + (Math.random() - 0.5) * cameraShake;
    cameraShake *= 0.93;
    if (cameraShake < 0.01) {
      cameraShake = 0;
      camera.position.set(0, 4, 12);
    }
  } else if (gameState === 'flying') {
    const t = (Date.now() - startTime) / 1000;
    camera.position.x = Math.sin(t * 0.2) * 1;
    camera.position.y = 4 + Math.sin(t * 0.3) * 0.3;
    camera.position.z = 12 - Math.min(t * 0.1, 2);
  }

  camera.lookAt(airplane ? airplane.position.clone().add(new THREE.Vector3(0, 0.5, -3)) : new THREE.Vector3(0, 2, 0));

  updateParticles();
  renderer.render(scene, camera);
}

function updateMultiplierDisplay(value, state) {
  const el = document.getElementById('multiplier-text');
  if (state === 'flying') {
    el.textContent = value.toFixed(2) + 'x';
    el.className = '';
    if (value >= 10) {
      el.style.color = '#ff00ff';
    } else if (value >= 5) {
      el.style.color = '#ffaa00';
    } else if (value >= 2) {
      el.style.color = '#00ff88';
    } else {
      el.style.color = '#00f0ff';
    }
  } else if (state === 'crashed') {
    el.textContent = value.toFixed(2) + 'x';
    el.className = 'crashed';
    el.style.color = '';
  } else if (state === 'cashout') {
    el.textContent = '+' + value.toFixed(2) + 'x';
    el.className = '';
    el.style.color = '#00e676';
  } else {
    el.textContent = 'PLACE YOUR BET';
    el.className = 'waiting';
    el.style.color = '';
  }
}

function updateBalance(amount) {
  balance = Math.max(0, Math.floor(amount * 100) / 100);
  document.getElementById('balance').textContent = balance.toFixed(2);
}

function addHistoryItem(cp, hash, commitment) {
  const row = document.getElementById('history-row');
  const item = document.createElement('div');
  let colorClass = 'red';
  if (cp >= 10) colorClass = 'purple';
  else if (cp >= 2) colorClass = 'green';
  item.className = 'history-item ' + colorClass;
  item.textContent = cp.toFixed(2) + 'x';
  item.onclick = () => showVerifyModal(hash, cp, commitment);
  row.insertBefore(item, row.firstChild);
  if (row.children.length > 15) row.removeChild(row.lastChild);
}

function showVerifyModal(hash, cp, commitment) {
  document.getElementById('verify-hash').textContent = hash;
  document.getElementById('verify-commitment').textContent = commitment || 'N/A';
  const crashEl = document.getElementById('verify-crash');
  crashEl.textContent = cp.toFixed(2) + 'x';
  crashEl.style.color = cp >= 2 ? '#00e676' : '#ff5252';
  document.getElementById('verify-modal').classList.add('active');
}

function closeVerifyModal() {
  document.getElementById('verify-modal').classList.remove('active');
}

function setBet(amount) {
  document.getElementById('bet-amount').value = amount;
}

function halfBet() {
  const input = document.getElementById('bet-amount');
  input.value = Math.max(1, Math.floor(parseFloat(input.value) / 2));
}

function doubleBet() {
  const input = document.getElementById('bet-amount');
  input.value = Math.min(balance, parseFloat(input.value) * 2);
}

function setButtonState(state) {
  const btn = document.getElementById('action-btn');
  btn.className = 'action-btn';
  switch (state) {
    case 'bet':
      btn.classList.add('bet');
      btn.textContent = 'BET';
      btn.disabled = false;
      break;
    case 'cashout':
      btn.classList.add('cashout');
      btn.textContent = 'CASH OUT';
      btn.disabled = false;
      break;
    case 'waiting':
      btn.classList.add('waiting');
      btn.textContent = 'WAITING...';
      btn.disabled = true;
      break;
  }
}

async function handleAction() {
  if (gameState === 'idle') {
    await placeBet();
  } else if (gameState === 'flying' && !cashedOut) {
    await cashOut();
  }
}

async function placeBet() {
  const betAmount = parseFloat(document.getElementById('bet-amount').value);
  if (isNaN(betAmount) || betAmount <= 0) {
    document.getElementById('status-msg').textContent = 'Enter a valid bet amount';
    return;
  }
  if (betAmount > balance) {
    document.getElementById('status-msg').textContent = 'Insufficient balance';
    return;
  }

  currentBet = betAmount;
  updateBalance(balance - betAmount);
  cashedOut = false;

  try {
    const res = await fetch('/api/game/new');
    const data = await res.json();
    roundCommitment = data.commitment;
    document.getElementById('status-msg').textContent = 'Round ' + data.roundId + ' - Commit: ' + data.commitment.substring(0, 16) + '...';
  } catch (e) {
    updateBalance(balance + betAmount);
    return;
  }

  setButtonState('waiting');
  updateMultiplierDisplay(0, 'waiting');
  document.getElementById('multiplier-text').textContent = 'STARTING...';

  setTimeout(async () => {
    await beginFlying();
  }, 1500);
}

async function beginFlying() {
  try {
    const res = await fetch('/api/game/start', { method: 'POST' });
    const data = await res.json();
    if (data.error) return;
    startTime = data.startTime;
  } catch (e) { return; }

  gameState = 'flying';
  currentMultiplier = 1.00;

  playEngineSound();
  setButtonState('cashout');
  runGameLoop();
}

function runGameLoop() {
  if (gameLoop) clearInterval(gameLoop);

  const localUpdate = setInterval(() => {
    if (gameState !== 'flying') {
      clearInterval(localUpdate);
      return;
    }
    const elapsed = (Date.now() - startTime) / 1000;
    currentMultiplier = Math.pow(Math.E, 0.07 * elapsed);
    currentMultiplier = Math.floor(currentMultiplier * 100) / 100;
    updateMultiplierDisplay(currentMultiplier, 'flying');
  }, 30);

  gameLoop = setInterval(async () => {
    if (gameState !== 'flying' || tickPending) return;
    tickPending = true;

    try {
      const res = await fetch('/api/game/tick', { method: 'POST' });
      const data = await res.json();

      if (data.crashed) {
        clearInterval(gameLoop);
        clearInterval(localUpdate);
        gameLoop = null;
        await triggerCrash(data);
      } else {
        currentMultiplier = data.multiplier;
        updateMultiplierDisplay(currentMultiplier, 'flying');

        const autoCashout = parseFloat(document.getElementById('auto-cashout').value);
        if (!isNaN(autoCashout) && autoCashout > 1 && currentMultiplier >= autoCashout && !cashedOut) {
          await cashOut();
        }
      }
    } catch (e) {
      console.error('Tick error:', e);
    }

    tickPending = false;
  }, 100);
}

async function cashOut() {
  if (cashedOut || gameState !== 'flying') return;
  cashedOut = true;

  try {
    const res = await fetch('/api/game/cashout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betAmount: currentBet })
    });
    const result = await res.json();

    if (result && result.success) {
      updateBalance(balance + result.winnings);
      updateMultiplierDisplay(result.multiplier, 'cashout');
      document.getElementById('status-msg').textContent =
        'Cashed out at ' + result.multiplier.toFixed(2) + 'x! Won ' + result.winnings.toFixed(2);
      setButtonState('waiting');
    } else {
      cashedOut = false;
    }
  } catch (e) {
    cashedOut = false;
  }
}

async function triggerCrash(data) {
  if (gameState === 'crashed') return;
  gameState = 'crashed';

  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }

  stopEngineSound();
  playExplosionSound();

  crashPoint = data.crashPoint;
  updateMultiplierDisplay(crashPoint, 'crashed');

  if (airplane) {
    createExplosionParticles(airplane.position.clone());
  }

  cameraShake = 1.5;

  const overlay = document.getElementById('crash-overlay');
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 1000);

  if (!cashedOut) {
    document.getElementById('status-msg').textContent =
      'Crashed at ' + crashPoint.toFixed(2) + 'x! Lost ' + currentBet.toFixed(2);
  }

  addHistoryItem(crashPoint, data.hash, data.commitment);

  setTimeout(() => {
    resetForNewRound();
  }, 3000);
}

function resetForNewRound() {
  gameState = 'idle';
  currentMultiplier = 1.00;
  cashedOut = false;

  if (airplane) {
    airplane.position.set(0, airplaneBaseY, 0);
    airplane.rotation.set(0, Math.PI, 0);
  }
  camera.position.set(0, 4, 12);

  updateMultiplierDisplay(0, 'idle');
  setButtonState('bet');
  document.getElementById('status-msg').textContent = 'Provably Fair - SHA-256 Hash Chain';
}

document.addEventListener('DOMContentLoaded', () => {
  init3D();
  initAudio();
  updateBalance(balance);

  document.addEventListener('click', () => {
    if (engineSound) engineSound.load();
    if (explosionSound) explosionSound.load();
  }, { once: true });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      handleAction();
    }
  });

  fetch('/api/game/history')
    .then(r => r.json())
    .then(history => {
      history.reverse().forEach(h => addHistoryItem(h.crashPoint, h.hash, h.commitment));
    })
    .catch(() => {});
});
