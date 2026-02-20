let scene, camera, renderer, airplane, cityModels = [];
let engineSound, explosionSound;
let explosionModel = null;
let activeExplosions = [];
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
let buildingPositions = [];
let corridorBuildings = [];
let cityBuildingMeshes = [];
let flightPath = null;
let crashTarget = null;
let crashAnimStart = 0;
let citySegmentZ = 0;
let flySpeedRamp = 0;
let resetFadeIn = 0;
let camLerpFactor = 0.03;
let camTargetLerp = 0.03;
let prevCamTarget = null;
let camObstructionOffset = new THREE.Vector3(0, 0, 0);
const camRaycaster = new THREE.Raycaster();
const CITY_SEGMENT_LENGTH = 10;
const CITY_RECYCLE_BEHIND = 30;
const CITY_GENERATE_AHEAD = 120;
let buildingMaterials = [];

function init3D() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060618);
  scene.fog = new THREE.FogExp2(0x060618, 0.008);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(5, 10, 16);
  camera.lookAt(0, 2, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.8;

  const ambientLight = new THREE.AmbientLight(0x8899bb, 1.2);
  scene.add(ambientLight);

  const moonLight = new THREE.DirectionalLight(0xaabbdd, 1.8);
  moonLight.position.set(20, 30, -10);
  moonLight.castShadow = true;
  scene.add(moonLight);

  const frontLight = new THREE.DirectionalLight(0xffffff, 1.0);
  frontLight.position.set(5, 10, 15);
  scene.add(frontLight);

  const cityGlow = new THREE.PointLight(0x00f0ff, 2.5, 120);
  cityGlow.position.set(0, -5, -20);
  scene.add(cityGlow);

  const warmGlow = new THREE.PointLight(0xff6600, 1.0, 80);
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
  buildingPositions = [];
  corridorBuildings = [];
  cityBuildingMeshes = [];

  buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, emissive: 0x0a0a15, roughness: 0.8, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0x16213e, emissive: 0x080818, roughness: 0.7, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0x0f3460, emissive: 0x050520, roughness: 0.6, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x1a1a3e, emissive: 0x0a0a20, roughness: 0.7, metalness: 0.3 })
  ];

  for (let z = 10; z > -CITY_GENERATE_AHEAD; z -= CITY_SEGMENT_LENGTH) {
    spawnCitySegment(z);
  }
  citySegmentZ = -CITY_GENERATE_AHEAD;

  scene.add(cityGroup);
}

function spawnCitySegment(z) {
  const segGroup = new THREE.Group();
  segGroup.userData.segZ = z;
  segGroup.userData.buildings = [];
  segGroup.userData.corridorBuilds = [];

  for (let j = 0; j < 2; j++) {
    const side = (j === 0) ? -1 : 1;
    const cWidth = 2.5 + Math.random() * 2.5;
    const minInnerEdge = 7.0;
    const corridorX = side * (minInnerEdge + cWidth / 2 + Math.random() * 5);
    const cHeight = 8 + Math.random() * 18;
    const cDepth = 3 + Math.random() * 4;
    const geo = new THREE.BoxGeometry(cWidth, cHeight, cDepth);
    const mat = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)].clone();
    const bld = new THREE.Mesh(geo, mat);
    const bz = z - Math.random() * CITY_SEGMENT_LENGTH * 0.6;
    bld.position.set(corridorX, cHeight / 2 - 2, bz);
    bld.castShadow = true;
    bld.receiveShadow = true;
    segGroup.add(bld);
    const bData = { x: corridorX, y: cHeight / 2 - 2, z: bz, height: cHeight, width: cWidth, depth: cDepth, side: side, segZ: z };
    buildingPositions.push(bData);
    corridorBuildings.push(bData);
    segGroup.userData.buildings.push(bData);
    segGroup.userData.corridorBuilds.push(bData);
    addWindowLightsToGroup(segGroup, cWidth, cHeight, cDepth, corridorX, bz);
  }

  for (let s = 0; s < 2; s++) {
    const outerCount = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < outerCount; k++) {
      const oWidth = 2 + Math.random() * 4;
      const oHeight = 5 + Math.random() * 16;
      const oDepth = 2 + Math.random() * 4;
      const geo = new THREE.BoxGeometry(oWidth, oHeight, oDepth);
      const mat = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)].clone();
      const bld = new THREE.Mesh(geo, mat);
      const ox = s === 0 ? -14 - Math.random() * 14 : 14 + Math.random() * 14;
      const oz = z - Math.random() * CITY_SEGMENT_LENGTH;
      bld.position.set(ox, oHeight / 2 - 2, oz);
      bld.castShadow = true;
      segGroup.add(bld);
      const bData = { x: ox, y: oHeight / 2 - 2, z: oz, height: oHeight, width: oWidth, depth: oDepth, segZ: z };
      buildingPositions.push(bData);
      segGroup.userData.buildings.push(bData);
      addWindowLightsToGroup(segGroup, oWidth, oHeight, oDepth, ox, oz);
    }
  }

  cityGroup.add(segGroup);
  cityBuildingMeshes.push(segGroup);
}

function recycleCityBuildings(planeZ) {
  const generateAt = planeZ - CITY_GENERATE_AHEAD;
  while (citySegmentZ > generateAt) {
    citySegmentZ -= CITY_SEGMENT_LENGTH;
    spawnCitySegment(citySegmentZ);
  }

  for (let i = cityBuildingMeshes.length - 1; i >= 0; i--) {
    const seg = cityBuildingMeshes[i];
    if (seg.userData.segZ > planeZ + CITY_RECYCLE_BEHIND) {
      const segBuildings = seg.userData.buildings || [];
      const segCorridor = seg.userData.corridorBuilds || [];
      for (const b of segBuildings) {
        const idx = buildingPositions.indexOf(b);
        if (idx !== -1) buildingPositions.splice(idx, 1);
      }
      for (const b of segCorridor) {
        const idx = corridorBuildings.indexOf(b);
        if (idx !== -1) corridorBuildings.splice(idx, 1);
      }

      cityGroup.remove(seg);
      seg.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      cityBuildingMeshes.splice(i, 1);
    }
  }
}

function generateFlightPath() {
  const speed = 0.6 + Math.random() * 0.3;
  const startX = (Math.random() - 0.5) * 2;
  const startZ = 5;
  const bankAmplitude = 0.3 + Math.random() * 0.15;

  flightPath = { speed, startX, startZ, bankAmplitude, lastWeaveZ: startZ, weaveTargetX: startX };
}

function pickCrashTarget() {
  if (buildingPositions.length === 0 || !airplane) return;

  const tallBuildings = buildingPositions.filter(b => b.height > 6);
  if (tallBuildings.length === 0) return;

  const visible = tallBuildings.filter(b => {
    const dx = b.x - airplane.position.x;
    const dz = b.z - airplane.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist > 5 && dist < 40;
  });

  if (visible.length > 0) {
    crashTarget = visible[Math.floor(Math.random() * visible.length)];
  } else {
    crashTarget = tallBuildings[Math.floor(Math.random() * tallBuildings.length)];
  }

  const hitY = crashTarget.y + crashTarget.height * 0.2 + Math.random() * crashTarget.height * 0.4;
  const hitX = crashTarget.x + (Math.random() - 0.5) * crashTarget.width * 0.3;
  const hitZ = crashTarget.z + crashTarget.depth * 0.5 + 0.5;
  crashTarget.hitPoint = new THREE.Vector3(hitX, hitY, hitZ);
  crashAnimStart = Date.now();
}

function addWindowLightsToGroup(group, bWidth, bHeight, bDepth, bx, bz) {
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
      group.add(win);
    }
  }
}

function loadModels() {
  const loader = new THREE.GLTFLoader();

  loader.load('/models/airplane/scene.gltf', (gltf) => {
    airplane = gltf.scene;
    airplane.scale.set(10, 10, 10);
    airplane.position.set(0, airplaneBaseY, 0);
    airplane.rotation.y = Math.PI;

    airplane.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const engineGlow = new THREE.PointLight(0xff4400, 1, 8);
    engineGlow.position.set(-1, 0, 0);
    airplane.add(engineGlow);

    const navLightLeft = new THREE.PointLight(0xff0000, 0.5, 5);
    navLightLeft.position.set(0, 0, 3);
    airplane.add(navLightLeft);

    const navLightRight = new THREE.PointLight(0x00ff00, 0.5, 5);
    navLightRight.position.set(0, 0, -3);
    airplane.add(navLightRight);

    const planeSpot = new THREE.PointLight(0xffffff, 2.0, 40);
    planeSpot.position.set(0, 5, 0);
    airplane.add(planeSpot);

    scene.add(airplane);
    console.log('Boeing 707 GLTF model loaded successfully');
  }, undefined, (error) => {
    console.warn('Could not load airplane GLTF, using fallback:', error);
    createAirplane();
  });

  loader.load('/models/explosion/scene.gltf', (gltf) => {
    explosionModel = gltf.scene;
    explosionModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.depthWrite = false;
        child.material.blending = THREE.AdditiveBlending;
        child.material.side = THREE.DoubleSide;
        if (child.material.emissiveMap) {
          child.material.emissiveIntensity = 4.5;
        }
      }
    });
    console.log('Explosion GLTF model loaded');
  }, undefined, (error) => {
    console.warn('Could not load explosion GLTF model:', error);
  });

}

function createAirplane() {
  airplane = new THREE.Group();

  const fuselageMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.7, roughness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x1a5276, metalness: 0.5, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x87ceeb, metalness: 0.9, roughness: 0.1, emissive: 0x224466, emissiveIntensity: 0.3 });

  const fuselageGeom = new THREE.CylinderGeometry(0.5, 0.35, 7, 12);
  const fuselage = new THREE.Mesh(fuselageGeom, fuselageMat);
  fuselage.rotation.z = Math.PI / 2;
  airplane.add(fuselage);

  const noseGeom = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const nose = new THREE.Mesh(noseGeom, fuselageMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(3.5, 0, 0);
  airplane.add(nose);

  const cockpitGeom = new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeom, windowMat);
  cockpit.rotation.z = -Math.PI / 2;
  cockpit.position.set(3.3, 0.15, 0);
  airplane.add(cockpit);

  const wingGeom = new THREE.BoxGeometry(2, 6, 0.12);
  const wings = new THREE.Mesh(wingGeom, accentMat);
  wings.position.set(-0.3, 0, 0);
  airplane.add(wings);

  const wingTipGeomL = new THREE.BoxGeometry(0.4, 0.15, 0.5);
  const wingTipL = new THREE.Mesh(wingTipGeomL, accentMat);
  wingTipL.position.set(-0.3, 3, 0);
  airplane.add(wingTipL);
  const wingTipR = new THREE.Mesh(wingTipGeomL, accentMat);
  wingTipR.position.set(-0.3, -3, 0);
  airplane.add(wingTipR);

  const tailWingGeom = new THREE.BoxGeometry(1.2, 2.5, 0.08);
  const tailWing = new THREE.Mesh(tailWingGeom, accentMat);
  tailWing.position.set(-3.2, 0, 0);
  airplane.add(tailWing);

  const vertTailGeom = new THREE.BoxGeometry(1.5, 0.08, 1.8);
  const vertTail = new THREE.Mesh(vertTailGeom, accentMat);
  vertTail.position.set(-3, 0, 0.9);
  airplane.add(vertTail);

  const stripeGeom = new THREE.CylinderGeometry(0.52, 0.37, 7.05, 12, 1, true, -0.3, 0.6);
  const stripe = new THREE.Mesh(stripeGeom, accentMat);
  stripe.rotation.z = Math.PI / 2;
  airplane.add(stripe);

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1.5 : -1.5;
    const engineGeom = new THREE.CylinderGeometry(0.2, 0.22, 1.2, 8);
    const engine = new THREE.Mesh(engineGeom, darkMat);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(0.3, side, -0.35);
    airplane.add(engine);

    const intakeGeom = new THREE.RingGeometry(0.05, 0.2, 8);
    const intakeMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8, side: THREE.DoubleSide });
    const intake = new THREE.Mesh(intakeGeom, intakeMat);
    intake.rotation.y = Math.PI / 2;
    intake.position.set(-0.3, side, -0.35);
    airplane.add(intake);
  }

  const engineGlow = new THREE.PointLight(0xff4400, 1, 8);
  engineGlow.position.set(-1, 0, 0);
  airplane.add(engineGlow);

  const navLightLeft = new THREE.PointLight(0xff0000, 0.5, 5);
  navLightLeft.position.set(-0.3, 3.2, 0);
  airplane.add(navLightLeft);

  const navLightRight = new THREE.PointLight(0x00ff00, 0.5, 5);
  navLightRight.position.set(-0.3, -3.2, 0);
  airplane.add(navLightRight);

  const tailLight = new THREE.PointLight(0xffffff, 0.3, 4);
  tailLight.position.set(-3.5, 0, 1.5);
  airplane.add(tailLight);

  airplane.position.set(0, airplaneBaseY, 0);
  airplane.rotation.y = Math.PI;
  airplane.scale.set(1.2, 1.2, 1.2);
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
  if (explosionModel) {
    for (let i = 0; i < 5; i++) {
      const exp = explosionModel.clone();
      const s = 2 + Math.random() * 3;
      exp.scale.set(s, s, s);
      exp.position.copy(position);
      exp.position.x += (Math.random() - 0.5) * 2;
      exp.position.y += (Math.random() - 0.5) * 2;
      exp.position.z += (Math.random() - 0.5) * 2;
      exp.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      exp.userData.life = 1.0;
      exp.userData.decay = 0.008 + Math.random() * 0.012;
      exp.userData.rotSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1
      );
      exp.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.15,
        Math.random() * 0.1,
        (Math.random() - 0.5) * 0.15
      );
      scene.add(exp);
      activeExplosions.push(exp);
    }
  }

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

  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const exp = activeExplosions[i];
    exp.userData.life -= exp.userData.decay;
    exp.position.add(exp.userData.velocity);
    exp.rotation.x += exp.userData.rotSpeed.x;
    exp.rotation.y += exp.userData.rotSpeed.y;
    exp.rotation.z += exp.userData.rotSpeed.z;
    const s = exp.scale.x * (1 + exp.userData.decay * 2);
    exp.scale.set(s, s, s);
    exp.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.opacity = exp.userData.life;
      }
    });
    if (exp.userData.life <= 0) {
      scene.remove(exp);
      activeExplosions.splice(i, 1);
    }
  }
}

let animTime = 0;
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animate() {
  requestAnimationFrame(animate);
  const dt = 0.016;
  animTime += dt;

  camLerpFactor += (camTargetLerp - camLerpFactor) * 0.03;

  if (resetFadeIn > 0 && resetFadeIn < 1) {
    resetFadeIn = Math.min(1, resetFadeIn + dt * 1.2);
    if (airplane) {
      airplane.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.opacity = resetFadeIn;
          child.material.transparent = resetFadeIn < 1;
          if (resetFadeIn >= 1) {
            child.material.transparent = false;
            child.material.opacity = 1;
          }
        }
      });
    }
  }

  if (flySpeedRamp < 1 && gameState === 'flying') {
    flySpeedRamp = Math.min(1, flySpeedRamp + dt * 0.5);
  }

  if (airplane) {
    if (gameState === 'flying' && flightPath) {
      const flyTime = (Date.now() - startTime) / 1000;
      const fp = flightPath;
      const speedMultiplier = easeInOut(flySpeedRamp);
      const currentSpeed = fp.speed * speedMultiplier;

      const currentZ = fp.startZ - flyTime * (0.1 + currentSpeed * 0.9);
      const bobAmount = Math.sin(flyTime * 2) * 0.1 * speedMultiplier;
      const heightBase = airplaneBaseY + 2 + Math.sin(flyTime * 0.3) * 1.5 * speedMultiplier;

      const idleHeight = airplaneBaseY + 3;
      const flyHeight = heightBase + bobAmount;
      const blendedHeight = idleHeight + (flyHeight - idleHeight) * speedMultiplier;

      const lookAhead = 30 + currentSpeed * 12;
      const nearbyBuildings = corridorBuildings.filter(b =>
        b.z > currentZ - lookAhead && b.z < currentZ + 5
      );

      let targetX = fp.weaveTargetX;
      const planeX = airplane.position.x;
      const safeMargin = 2.5;

      if (nearbyBuildings.length > 0) {
        let threat = null;
        let threatDist = Infinity;
        for (const b of nearbyBuildings) {
          const dz = currentZ - b.z;
          if (dz > -8 && dz < threatDist) {
            const innerEdge = b.x - (b.width / 2 + safeMargin) * Math.sign(b.x);
            const distToEdge = Math.abs(planeX - (b.x - Math.sign(b.x) * (b.width / 2 + safeMargin)));
            if (distToEdge < 8) {
              threatDist = dz;
              threat = b;
            }
          }
        }

        if (threat) {
          const innerEdge = threat.x > 0
            ? threat.x - threat.width / 2 - safeMargin
            : threat.x + threat.width / 2 + safeMargin;
          targetX = threat.x > 0 ? innerEdge - 2.0 : innerEdge + 2.0;
        }

        for (const b of nearbyBuildings) {
          const dz = Math.abs(currentZ - b.z);
          if (dz < 12) {
            const bLeft = b.x - b.width / 2 - safeMargin;
            const bRight = b.x + b.width / 2 + safeMargin;
            if (targetX > bLeft && targetX < bRight) {
              targetX = b.x > 0 ? bLeft - 1.5 : bRight + 1.5;
            }
          }
        }
        fp.weaveTargetX = targetX;
      } else {
        fp.weaveTargetX += (Math.sin(flyTime * 0.4) * 3 - fp.weaveTargetX) * 0.02;
      }

      fp.weaveTargetX = Math.max(-5.0, Math.min(5.0, fp.weaveTargetX));

      const weaveLerp = 0.08 + 0.08 * speedMultiplier;
      airplane.position.x += (fp.weaveTargetX - airplane.position.x) * weaveLerp;
      airplane.position.y = blendedHeight;
      airplane.position.z = currentZ;

      recycleCityBuildings(currentZ);

      const dx = fp.weaveTargetX - airplane.position.x;
      const maxBank = 0.2 + 0.2 * speedMultiplier;
      const bankTarget = Math.max(-maxBank, Math.min(maxBank, dx * 0.15));
      airplaneCurrentBank += (bankTarget - airplaneCurrentBank) * 0.05;
      airplane.rotation.z = airplaneCurrentBank;

      const pitchOsc = Math.sin(flyTime * 0.7) * 0.03 * speedMultiplier - 0.02 * speedMultiplier;
      airplane.rotation.x = pitchOsc;
      airplane.rotation.y = Math.PI + airplaneCurrentBank * 0.25;

    } else if (gameState === 'crashed') {
      if (crashTarget && crashTarget.hitPoint) {
        const t = (Date.now() - crashAnimStart) / 1000;
        const crashDuration = 1.2;

        if (t < crashDuration) {
          const progress = Math.min(t / crashDuration, 1);
          const eased = easeInOut(progress);
          const startPos = crashTarget.startPos;
          if (startPos) {
            airplane.position.x = startPos.x + (crashTarget.hitPoint.x - startPos.x) * eased;
            airplane.position.y = startPos.y + (crashTarget.hitPoint.y - startPos.y) * eased;
            airplane.position.z = startPos.z + (crashTarget.hitPoint.z - startPos.z) * eased;
            airplane.rotation.x = -0.4 * eased;
            airplane.rotation.z = airplaneCurrentBank + (Math.PI * 0.15) * eased;
          }
        } else {
          const fadeT = Math.min((t - crashDuration) / 0.5, 1);
          airplane.traverse(child => {
            if (child.isMesh && child.material) {
              child.material.transparent = true;
              child.material.opacity = 1 - fadeT;
            }
          });
          if (fadeT >= 1) airplane.visible = false;
        }
      } else {
        if (airplane.position.y > -5) {
          airplane.position.y -= 0.12;
          airplane.rotation.x += 0.025;
          airplane.rotation.z += 0.03;
        }
      }
    } else {
      const idleSpeed = 0.3;
      const idleZ = 5 - animTime * idleSpeed;
      const bobAmount = Math.sin(animTime * 1.5) * 0.15;
      let weaveX = Math.sin(animTime * 0.25) * 3.5;
      const idleSafeMargin = 2.5;

      const idleNearby = corridorBuildings.filter(b =>
        b.z > idleZ - 25 && b.z < idleZ + 5
      );
      for (const b of idleNearby) {
        const dz = Math.abs(idleZ - b.z);
        if (dz < 12) {
          const bLeft = b.x - b.width / 2 - idleSafeMargin;
          const bRight = b.x + b.width / 2 + idleSafeMargin;
          if (weaveX > bLeft && weaveX < bRight) {
            weaveX = b.x > 0 ? bLeft - 1.5 : bRight + 1.5;
          }
        }
      }
      weaveX = Math.max(-5.0, Math.min(5.0, weaveX));

      airplane.position.x += (weaveX - airplane.position.x) * 0.08;
      airplane.position.z = idleZ;
      airplane.position.y = airplaneBaseY + 3 + bobAmount;

      const dx = weaveX - airplane.position.x;
      const idleBank = Math.max(-0.2, Math.min(0.2, dx * 0.1));
      airplane.rotation.z += (idleBank - airplane.rotation.z) * 0.04;
      airplane.rotation.y = Math.PI + airplane.rotation.z * 0.2;
      airplane.rotation.x = Math.sin(animTime * 0.8) * 0.02;

      recycleCityBuildings(idleZ);
    }
  }

  const camOffsetX = 5;
  const camOffsetY = 10;
  const camOffsetZ = 16;
  const planePos = airplane ? airplane.position : new THREE.Vector3(0, 2, 0);

  let targetCamX = planePos.x + camOffsetX;
  let targetCamY = planePos.y + camOffsetY - 2;
  let targetCamZ = planePos.z + camOffsetZ;

  if (gameState === 'flying' && airplane) {
    const t = (Date.now() - startTime) / 1000;
    targetCamX += Math.sin(t * 0.15) * 1.5 * easeInOut(flySpeedRamp);
    targetCamY += Math.sin(t * 0.25) * 0.5 * easeInOut(flySpeedRamp);
    camTargetLerp = 0.06;
  } else if (gameState === 'crashed') {
    camTargetLerp = 0.025;
  } else {
    camTargetLerp = 0.035;
  }

  if (airplane && cityGroup) {
    const desiredCamPos = new THREE.Vector3(targetCamX, targetCamY, targetCamZ);
    const toPlane = new THREE.Vector3().subVectors(planePos, desiredCamPos);
    const dist = toPlane.length();
    camRaycaster.set(desiredCamPos, toPlane.normalize());
    camRaycaster.far = dist;
    camRaycaster.near = 0.1;

    const hits = camRaycaster.intersectObjects(cityGroup.children, true);
    const blocked = hits.some(h => h.distance < dist - 1.0);

    if (blocked) {
      camObstructionOffset.y += (8 - camObstructionOffset.y) * 0.08;
      camObstructionOffset.x += (-camOffsetX * 0.4 - camObstructionOffset.x) * 0.06;
    } else {
      camObstructionOffset.x += (0 - camObstructionOffset.x) * 0.04;
      camObstructionOffset.y += (0 - camObstructionOffset.y) * 0.04;
    }

    targetCamX += camObstructionOffset.x;
    targetCamY += camObstructionOffset.y;
    targetCamZ += camObstructionOffset.z;
  }

  if (cameraShake > 0) {
    targetCamX += (Math.random() - 0.5) * cameraShake;
    targetCamY += (Math.random() - 0.5) * cameraShake;
    targetCamZ += (Math.random() - 0.5) * cameraShake;
    cameraShake *= 0.93;
    if (cameraShake < 0.01) cameraShake = 0;
  }

  camera.position.x += (targetCamX - camera.position.x) * camLerpFactor;
  camera.position.y += (targetCamY - camera.position.y) * camLerpFactor;
  camera.position.z += (targetCamZ - camera.position.z) * camLerpFactor;

  const lookTarget = airplane ? airplane.position.clone().add(new THREE.Vector3(0, 0, -2)) : new THREE.Vector3(0, 2, 0);
  if (!prevCamTarget) prevCamTarget = lookTarget.clone();
  prevCamTarget.lerp(lookTarget, camLerpFactor * 1.5);
  camera.lookAt(prevCamTarget);

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
  flySpeedRamp = 0;
  prevCamTarget = null;
  camObstructionOffset.set(0, 0, 0);
  generateFlightPath();

  if (airplane) {
    flightPath.startZ = airplane.position.z;
    flightPath.startX = airplane.position.x;
    flightPath.weaveTargetX = airplane.position.x;
    airplane.visible = true;
    airplaneCurrentBank = airplane.rotation.z;
  }

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

  crashPoint = data.crashPoint;
  updateMultiplierDisplay(crashPoint, 'crashed');

  if (airplane) {
    crashTarget = null;
    pickCrashTarget();
    if (crashTarget && crashTarget.hitPoint) {
      crashTarget.startPos = airplane.position.clone();
      crashAnimStart = Date.now();

      setTimeout(() => {
        playExplosionSound();
        if (airplane) createExplosionParticles(crashTarget.hitPoint.clone());
        cameraShake = 2.0;
      }, 1100);
    } else {
      playExplosionSound();
      createExplosionParticles(airplane.position.clone());
      cameraShake = 1.5;
    }
  } else {
    playExplosionSound();
    cameraShake = 1.5;
  }

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
  flightPath = null;
  crashTarget = null;
  flySpeedRamp = 0;
  prevCamTarget = null;
  camObstructionOffset.set(0, 0, 0);

  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    scene.remove(activeExplosions[i]);
  }
  activeExplosions = [];

  if (airplane) {
    airplane.visible = true;
    airplane.rotation.set(0, Math.PI, 0);
    airplaneCurrentBank = 0;
    resetFadeIn = 0.01;
    airplane.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.opacity = 0;
      }
    });
  }

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
