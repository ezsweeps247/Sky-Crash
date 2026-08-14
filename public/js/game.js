let scene, camera, renderer, airplane, airplaneModel = null;
let engineSound, explosionSound;
let explosionModel = null;
let runwayModel = null;
let activeExplosions = [];
let gameLoop = null;
let currentMultiplier = 1.00;
let crashPoint = 0;
let gameState = 'idle';
let balance = 1000.00;
let currentBet = 0;
let roundCommitment = '';
let cashedOut = false;
let startTime = 0;          // server clock — drives the multiplier display
let flightStartTime = 0;    // visual clock — drives plane motion (decoupled so flight never jumps)
let airplaneBaseY = 2;
let airplaneCurrentBank = 0;
let cameraShake = 0;
let particles = [];
let smokeParticles = [];
let cityGroup;
let groundMesh = null;
let starField = null;
let tickPending = false;
let buildingPositions = [];
let corridorBuildings = [];
let cityBuildingMeshes = [];
let animatedBeacons = [];
let neonSigns = [];
let trafficGroup = null;
let streetCars = [];
let flightPath = null;
let crashTarget = null;
let crashAnimStart = 0;
let citySegmentZ = 0;
let flySpeedRamp = 0;
let takeoffStartTime = 0;
let serverStartRequested = false;
let serverStartData = null;
let countdownTimer = null;
let winBannerTimer = null;
let nearMissTimer = null;
let nearMissCooldown = 0;
let fovPunch = 0;
let sessionProfit = 0;
let biggestWin = 0;
const TAKEOFF_DURATION = 3.5;
const RUNWAY_Z = 60;
const BASE_FOV = 50;
// Multiplier growth rate — must stay in sync with GROWTH_RATE in server.js
const GROWTH_RATE = 0.12;
let camLerpFactor = 0.03;
let camTargetLerp = 0.03;
let prevCamTarget = null;
let prevPlaneZ = null;
let camObstructionOffset = new THREE.Vector3(0, 0, 0);
const camRaycaster = new THREE.Raycaster();
const CITY_SEGMENT_LENGTH = 10;
const CITY_RECYCLE_BEHIND = 30;
const CITY_GENERATE_AHEAD = 160;

// Shared city assets (built once, reused by every segment — never disposed)
let facadeMaterials = [];
let roofMaterial = null;
let roadMaterial = null;
let lampPoleMaterial = null;
let lampHeadMaterial = null;
let lampGlowMaterial = null;
let beaconMaterial = null;
let antennaMaterial = null;
let tankMaterial = null;
let neonColors = [0x00f0ff, 0xff44cc, 0xffaa00, 0x66ff66, 0x8b5cf6];

// Airplane effects
let planeLights = null;
let contrailL = null, contrailR = null;
const CONTRAIL_POINTS = 90;
const CONTRAIL_LIFE = 1.5;

function init3D() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060618);
  scene.fog = new THREE.FogExp2(0x060618, 0.008);

  camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(6, 4.5, RUNWAY_Z + 14);
  camera.lookAt(0, 0, RUNWAY_Z);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.8;

  const ambientLight = new THREE.AmbientLight(0x8899bb, 0.85);
  scene.add(ambientLight);

  const moonLight = new THREE.DirectionalLight(0xaabbdd, 1.8);
  moonLight.position.set(20, 30, -10);
  moonLight.castShadow = true;
  scene.add(moonLight);

  const frontLight = new THREE.DirectionalLight(0xffffff, 0.7);
  frontLight.position.set(5, 10, 15);
  scene.add(frontLight);

  const cityGlow = new THREE.PointLight(0x00f0ff, 2.5, 120);
  cityGlow.position.set(0, -5, -20);
  scene.add(cityGlow);

  const warmGlow = new THREE.PointLight(0xff6600, 1.0, 80);
  warmGlow.position.set(-10, 5, -15);
  scene.add(warmGlow);

  createStarField();
  initCityBase();
  rebuildCity();
  initTraffic();
  loadModels();

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

  starField = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starField);
}

// ---------------------------------------------------------------------------
// Facade window textures — windows are baked into a canvas texture (color +
// emissive) instead of hundreds of individual window meshes per building.
// One texture cell = one window; UVs are remapped per building face so window
// size stays constant in world units regardless of building dimensions.
// ---------------------------------------------------------------------------

const FACADE_COLS = 6, FACADE_ROWS = 12;
const CELL_WORLD_W = 0.62, CELL_WORLD_H = 0.95;
const FACADE_WORLD_W = FACADE_COLS * CELL_WORLD_W;
const FACADE_WORLD_H = FACADE_ROWS * CELL_WORLD_H;

const facadePalettes = [
  { facade: '#141c26', lit: ['#ffd98c', '#ffe6b0', '#ffcf7a'], chance: 0.28 },
  { facade: '#101823', lit: ['#9fd4ff', '#bfe4ff', '#8cc6f5'], chance: 0.22 },
  { facade: '#161b21', lit: ['#ffe2a8', '#a8d8ff', '#fff2cc'], chance: 0.30 },
  { facade: '#181d23', lit: ['#ffd9a0', '#ffc98c'], chance: 0.16 },
  { facade: '#0f1a26', lit: ['#7fd0ff', '#a5e0ff'], chance: 0.33 },
  { facade: '#15171d', lit: ['#ffb75e', '#ffd28c'], chance: 0.24 },
];

function makeFacadeMaterial(palette) {
  const cw = 16, ch = 24;
  const w = FACADE_COLS * cw, h = FACADE_ROWS * ch;

  const colorCvs = document.createElement('canvas');
  colorCvs.width = w; colorCvs.height = h;
  const cc = colorCvs.getContext('2d');
  const emisCvs = document.createElement('canvas');
  emisCvs.width = w; emisCvs.height = h;
  const ec = emisCvs.getContext('2d');

  cc.fillStyle = palette.facade;
  cc.fillRect(0, 0, w, h);
  ec.fillStyle = '#000000';
  ec.fillRect(0, 0, w, h);

  for (let r = 0; r < FACADE_ROWS; r++) {
    for (let c = 0; c < FACADE_COLS; c++) {
      const x = c * cw, y = r * ch;
      // subtle per-panel facade variation
      if (Math.random() < 0.35) {
        cc.fillStyle = 'rgba(255,255,255,' + (0.015 + Math.random() * 0.02).toFixed(3) + ')';
        cc.fillRect(x, y, cw, ch);
      }
      const wx = x + 3.5, wy = y + 4, ww = cw - 7, wh = ch - 9;
      if (Math.random() < palette.chance) {
        const tint = palette.lit[Math.floor(Math.random() * palette.lit.length)];
        const dim = 0.45 + Math.random() * 0.5;
        cc.globalAlpha = dim * 0.5;
        cc.fillStyle = tint;
        cc.fillRect(wx, wy, ww, wh);
        cc.globalAlpha = 1;
        ec.globalAlpha = dim;
        ec.fillStyle = tint;
        ec.fillRect(wx, wy, ww, wh);
        ec.globalAlpha = 1;
      } else {
        cc.fillStyle = '#070a0f';
        cc.fillRect(wx, wy, ww, wh);
      }
    }
  }

  const map = new THREE.CanvasTexture(colorCvs);
  const emissiveMap = new THREE.CanvasTexture(emisCvs);
  for (const t of [map, emissiveMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }

  const mat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    color: 0xb9c1c9,
    emissive: 0xffffff,
    emissiveIntensity: 0.75,
    roughness: 0.5,
    metalness: 0.55,
  });
  mat.userData.shared = true;
  return mat;
}

// Rescale BoxGeometry UVs so the facade texture tiles at a fixed world size on
// the four wall faces. BoxGeometry vertex order: +x, -x, +y, -y, +z, -z (4 verts each).
function remapBoxUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  for (let face = 0; face < 6; face++) {
    if (face === 2 || face === 3) continue; // roof/floor use a plain material
    const span = (face < 2) ? d : w;
    const uR = span / FACADE_WORLD_W;
    const vR = h / FACADE_WORLD_H;
    const offU = Math.floor(Math.random() * FACADE_COLS) / FACADE_COLS;
    const offV = Math.floor(Math.random() * FACADE_ROWS) / FACADE_ROWS;
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * uR + offU, uv.getY(i) * vR + offV);
    }
  }
  uv.needsUpdate = true;
}

function makeBuildingMesh(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  remapBoxUVs(geo, w, h, d);
  const side = facadeMaterials[Math.floor(Math.random() * facadeMaterials.length)];
  const mesh = new THREE.Mesh(geo, [side, side, roofMaterial, roofMaterial, side, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeRoadTexture() {
  const cvs = document.createElement('canvas');
  cvs.width = 64; cvs.height = 256;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.03).toFixed(3) + ')';
    ctx.fillRect(Math.random() * 64, Math.random() * 256, 1.5, 1.5);
  }
  ctx.fillStyle = '#8a8a5a';
  ctx.fillRect(30, 20, 4, 60);
  ctx.fillRect(30, 150, 4, 60);
  ctx.fillStyle = 'rgba(200,200,200,0.25)';
  ctx.fillRect(2, 0, 2, 256);
  ctx.fillRect(60, 0, 2, 256);
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function initCityBase() {
  cityGroup = new THREE.Group();
  scene.add(cityGroup);

  facadeMaterials = [];
  for (const p of facadePalettes) facadeMaterials.push(makeFacadeMaterial(p));
  facadeMaterials.push(makeFacadeMaterial(facadePalettes[0]));
  facadeMaterials.push(makeFacadeMaterial(facadePalettes[4]));

  roofMaterial = new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.8, metalness: 0.2 });
  roofMaterial.userData.shared = true;
  roadMaterial = new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.9, metalness: 0.1 });
  roadMaterial.userData.shared = true;
  lampPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.6, metalness: 0.7 });
  lampPoleMaterial.userData.shared = true;
  lampHeadMaterial = new THREE.MeshBasicMaterial({ color: 0xffc36b });
  lampHeadMaterial.userData.shared = true;
  lampGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb45e, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  lampGlowMaterial.userData.shared = true;
  beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  beaconMaterial.userData.shared = true;
  antennaMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
  antennaMaterial.userData.shared = true;
  tankMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7, metalness: 0.5 });
  tankMaterial.userData.shared = true;

  const groundGeo = new THREE.PlaneGeometry(200, 800);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x131315, roughness: 0.75, metalness: 0.3,
  });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, -2, -200);
  groundMesh.receiveShadow = true;
  cityGroup.add(groundMesh);
}

// Tear down every city segment and respawn a fresh city around the runway.
// Called between rounds so each takeoff faces a full skyline instead of the
// hollowed-out corridor left behind by the previous flight.
function rebuildCity() {
  for (const seg of cityBuildingMeshes) disposeSegment(seg, true);
  cityBuildingMeshes = [];
  buildingPositions = [];
  corridorBuildings = [];
  animatedBeacons = [];
  neonSigns = [];

  for (let z = 10; z > -CITY_GENERATE_AHEAD; z -= CITY_SEGMENT_LENGTH) {
    spawnCitySegment(z);
  }
  citySegmentZ = -CITY_GENERATE_AHEAD;
}

function registerBeacon(segGroup, mesh) {
  const entry = { mesh, phase: Math.random() * Math.PI * 2, speed: 2.2 + Math.random() * 1.6 };
  animatedBeacons.push(entry);
  segGroup.userData.beacons.push(entry);
}

function addRooftopDetails(segGroup, bx, topY, bz, w, d, h) {
  if (h > 12 && Math.random() > 0.4) {
    const antennaH = 1 + Math.random() * 2;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, antennaH, 4), antennaMaterial);
    antenna.position.set(bx, topY + antennaH / 2, bz);
    segGroup.add(antenna);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), beaconMaterial);
    beacon.position.set(bx, topY + antennaH, bz);
    segGroup.add(beacon);
    registerBeacon(segGroup, beacon);
  }

  if (Math.random() < 0.35) {
    const rx = bx + (Math.random() - 0.5) * w * 0.4;
    const rz = bz + (Math.random() - 0.5) * d * 0.4;
    if (Math.random() < 0.5) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 8), tankMaterial);
      tank.position.set(rx, topY + 0.25, rz);
      segGroup.add(tank);
    } else {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.45), tankMaterial);
      ac.position.set(rx, topY + 0.15, rz);
      segGroup.add(ac);
    }
  }
}

function addNeonStrip(segGroup, b) {
  const color = neonColors[Math.floor(Math.random() * neonColors.length)];
  const stripH = b.height * (0.5 + Math.random() * 0.25);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, stripH, 0.09), mat);
  const innerX = b.x - Math.sign(b.x) * (b.width / 2 + 0.06);
  strip.position.set(innerX, b.y + b.height * 0.05, b.z + b.depth * 0.25);
  segGroup.add(strip);
  const entry = { mat, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 3 };
  neonSigns.push(entry);
  segGroup.userData.neons.push(entry);
}

function addStreetFurniture(segGroup, z) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, CITY_SEGMENT_LENGTH), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -1.985, z - CITY_SEGMENT_LENGTH / 2);
  road.receiveShadow = true;
  segGroup.add(road);

  const lampSpots = [
    { x: 6.4, z: z - 2.5 },
    { x: -6.4, z: z - 7.5 },
  ];
  for (const spot of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 1.5, 5), lampPoleMaterial);
    pole.position.set(spot.x, -1.25, spot.z);
    segGroup.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), lampHeadMaterial);
    head.position.set(spot.x, -0.5, spot.z);
    segGroup.add(head);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10), lampGlowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(spot.x, -1.975, spot.z);
    segGroup.add(glow);
  }
}

function spawnCitySegment(z) {
  const segGroup = new THREE.Group();
  segGroup.userData.segZ = z;
  segGroup.userData.buildings = [];
  segGroup.userData.corridorBuilds = [];
  segGroup.userData.beacons = [];
  segGroup.userData.neons = [];

  for (let j = 0; j < 2; j++) {
    const side = (j === 0) ? -1 : 1;
    const cWidth = 2.5 + Math.random() * 2.5;
    const minInnerEdge = 7.0;
    const corridorX = side * (minInnerEdge + cWidth / 2 + Math.random() * 5);
    const cHeight = 8 + Math.random() * 18;
    const cDepth = 3 + Math.random() * 4;
    const bld = makeBuildingMesh(cWidth, cHeight, cDepth);
    const bz = z - Math.random() * CITY_SEGMENT_LENGTH * 0.6;
    bld.position.set(corridorX, cHeight / 2 - 2, bz);
    segGroup.add(bld);

    // Tiered top on some taller towers
    if (cHeight > 14 && Math.random() < 0.35) {
      const tw = cWidth * 0.65, th = cHeight * 0.3, td = cDepth * 0.65;
      const tier = makeBuildingMesh(tw, th, td);
      tier.position.set(corridorX, cHeight - 2 + th / 2, bz);
      segGroup.add(tier);
      addRooftopDetails(segGroup, corridorX, cHeight - 2 + th, bz, tw, td, cHeight + th);
    } else {
      addRooftopDetails(segGroup, corridorX, cHeight - 2, bz, cWidth, cDepth, cHeight);
    }

    const bData = { x: corridorX, y: cHeight / 2 - 2, z: bz, height: cHeight, width: cWidth, depth: cDepth, side: side, segZ: z };
    buildingPositions.push(bData);
    corridorBuildings.push(bData);
    segGroup.userData.buildings.push(bData);
    segGroup.userData.corridorBuilds.push(bData);

    if (Math.random() < 0.18) addNeonStrip(segGroup, bData);
  }

  for (let s = 0; s < 2; s++) {
    const outerCount = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < outerCount; k++) {
      const oWidth = 2 + Math.random() * 4;
      const oHeight = 5 + Math.random() * 16;
      const oDepth = 2 + Math.random() * 4;
      const bld = makeBuildingMesh(oWidth, oHeight, oDepth);
      const ox = s === 0 ? -14 - Math.random() * 14 : 14 + Math.random() * 14;
      const oz = z - Math.random() * CITY_SEGMENT_LENGTH;
      bld.position.set(ox, oHeight / 2 - 2, oz);
      segGroup.add(bld);
      addRooftopDetails(segGroup, ox, oHeight - 2, oz, oWidth, oDepth, oHeight);
      const bData = { x: ox, y: oHeight / 2 - 2, z: oz, height: oHeight, width: oWidth, depth: oDepth, segZ: z };
      buildingPositions.push(bData);
      segGroup.userData.buildings.push(bData);
    }
  }

  addStreetFurniture(segGroup, z);

  cityGroup.add(segGroup);
  cityBuildingMeshes.push(segGroup);
}

function disposeSegment(seg, skipRegistry) {
  if (!skipRegistry) {
    for (const b of seg.userData.buildings || []) {
      const idx = buildingPositions.indexOf(b);
      if (idx !== -1) buildingPositions.splice(idx, 1);
    }
    for (const b of seg.userData.corridorBuilds || []) {
      const idx = corridorBuildings.indexOf(b);
      if (idx !== -1) corridorBuildings.splice(idx, 1);
    }
    for (const e of seg.userData.beacons || []) {
      const idx = animatedBeacons.indexOf(e);
      if (idx !== -1) animatedBeacons.splice(idx, 1);
    }
    for (const e of seg.userData.neons || []) {
      const idx = neonSigns.indexOf(e);
      if (idx !== -1) neonSigns.splice(idx, 1);
    }
  }

  cityGroup.remove(seg);
  seg.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m.userData.shared) m.dispose();
      }
    }
  });
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
      disposeSegment(seg, false);
      cityBuildingMeshes.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Street traffic — a small pool of cars cruising the corridor road below.
// ---------------------------------------------------------------------------

function initTraffic() {
  trafficGroup = new THREE.Group();
  scene.add(trafficGroup);
  const bodyColors = [0x25303a, 0x33272b, 0x1f2a33, 0x2c2f38, 0x30313a];

  for (let i = 0; i < 8; i++) {
    const car = new THREE.Group();
    const dir = (i % 2 === 0) ? -1 : 1;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.22, 0.9),
      new THREE.MeshStandardMaterial({ color: bodyColors[i % bodyColors.length], roughness: 0.4, metalness: 0.6 })
    );
    car.add(body);

    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
    for (const sx of [-0.12, 0.12]) {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 5), headMat);
      head.position.set(sx, 0, -0.46);
      car.add(head);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), tailMat);
      tail.position.set(sx, 0, 0.46);
      car.add(tail);
    }

    car.rotation.y = dir === 1 ? Math.PI : 0;
    car.position.set(dir === -1 ? -1.5 : 1.5, -1.78, RUNWAY_Z - 80 - Math.random() * 60);
    car.userData.dir = dir;
    car.userData.speed = 6 + Math.random() * 6;
    trafficGroup.add(car);
    streetCars.push(car);
  }
}

function updateTraffic(dt, refZ) {
  // Keep cars inside the stretch of city road ahead of the plane (roads only
  // exist below z ≈ 10, before the runway).
  const zMax = Math.min(refZ - 10, 6);
  const zMin = zMax - 140;
  for (const car of streetCars) {
    car.position.z += car.userData.dir * car.userData.speed * dt;
    if (car.position.z < zMin) car.position.z = zMax - Math.random() * 10;
    else if (car.position.z > zMax) car.position.z = zMin + Math.random() * 10;
  }
}

// ---------------------------------------------------------------------------
// Flight path + crash targeting
// ---------------------------------------------------------------------------

function generateFlightPath() {
  const speed = 0.6 + Math.random() * 0.3;
  const startX = (Math.random() - 0.5) * 2;
  const startZ = 5;
  const bankAmplitude = 0.3 + Math.random() * 0.15;

  flightPath = {
    speed, startX, startZ, bankAmplitude,
    weaveTargetX: startX,
    zPos: startZ,
    curSpeed: 0, // units/sec, integrated so speed can change smoothly mid-flight
  };
}

function pickCrashTarget() {
  crashTarget = null;
  if (buildingPositions.length === 0 || !airplane) return;

  // Only buildings genuinely near the plane qualify — crashing into a distant
  // one used to lerp the plane across the map, which looked like a teleport.
  const candidates = buildingPositions.filter(b => {
    if (b.height <= 6) return false;
    const dx = b.x - airplane.position.x;
    const dz = b.z - airplane.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist > 5 && dist < 40 && b.z < airplane.position.z + 4;
  });
  if (candidates.length === 0) return;

  crashTarget = candidates[Math.floor(Math.random() * candidates.length)];
  const hitY = crashTarget.y + crashTarget.height * 0.2 + Math.random() * crashTarget.height * 0.4;
  const hitX = crashTarget.x + (Math.random() - 0.5) * crashTarget.width * 0.3;
  const hitZ = crashTarget.z + crashTarget.depth * 0.5 + 0.5;
  crashTarget.hitPoint = new THREE.Vector3(hitX, hitY, hitZ);
  crashAnimStart = Date.now();
}

// ---------------------------------------------------------------------------
// Models — airplane (GLTF with procedural fallback), runway, explosion
// ---------------------------------------------------------------------------

function loadModels() {
  const loader = new THREE.GLTFLoader();

  loader.load('/models/airplane/scene.gltf', (gltf) => {
    const model = gltf.scene;
    model.scale.set(10, 10, 10);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    buildAirplaneGroup(model);
    console.log('Boeing GLTF model loaded successfully');
  }, undefined, (error) => {
    console.warn('Could not load airplane GLTF, using fallback:', error);
    buildAirplaneGroup(createFallbackAirplaneModel());
  });

  createProceduralRunway();

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

// Wrap the model in a group so game logic drives the group transform while
// lights/effects attach at unscaled local coordinates derived from the
// model's real bounding box (works for both the GLTF and the fallback).
function buildAirplaneGroup(model) {
  airplane = new THREE.Group();
  airplaneModel = model;
  airplane.add(model);
  airplane.position.set(0, -0.5, RUNWAY_Z);
  airplane.rotation.y = Math.PI;
  scene.add(airplane);

  // Measure with the group unrotated so offsets are in local space. Wingtips
  // come from a vertex scan — the actual extreme-x points of the mesh — so
  // nav lights and contrails sit exactly on the wing, not on the bounding box.
  airplane.rotation.y = 0;
  airplane.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(airplane);
  const center = box.getCenter(new THREE.Vector3()).sub(airplane.position);
  const ext = findWingtipVertices(airplane);
  const tipL = ext.minX.sub(airplane.position);
  const tipR = ext.maxX.sub(airplane.position);
  const nose = new THREE.Vector3(center.x, center.y, box.max.z - airplane.position.z);
  const top = new THREE.Vector3(center.x, box.max.y - airplane.position.y, center.z);
  airplane.rotation.y = Math.PI;
  airplane.updateMatrixWorld(true);

  setupPlaneLights(tipL, tipR, nose, top);
  contrailL = makeContrail();
  contrailR = makeContrail();
  contrailL.userData.tip = tipL.clone();
  contrailR.userData.tip = tipR.clone();
  scene.add(contrailL);
  scene.add(contrailR);
}

// World-space positions of the leftmost and rightmost mesh vertices —
// on a swept-wing airliner these are the wingtips.
function findWingtipVertices(root) {
  const minX = new THREE.Vector3(Infinity, 0, 0);
  const maxX = new THREE.Vector3(-Infinity, 0, 0);
  const v = new THREE.Vector3();
  root.traverse(node => {
    if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
    const pos = node.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
      if (v.x < minX.x) minX.copy(v);
      if (v.x > maxX.x) maxX.copy(v);
    }
  });
  return { minX, maxX };
}

function setupPlaneLights(tipL, tipR, nose, top) {
  const navLMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  navLMesh.position.copy(tipL);
  airplane.add(navLMesh);
  const navLLight = new THREE.PointLight(0xff3333, 0.5, 5);
  navLLight.position.copy(tipL);
  airplane.add(navLLight);

  const navRMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0x2aff5a }));
  navRMesh.position.copy(tipR);
  airplane.add(navRMesh);
  const navRLight = new THREE.PointLight(0x33ff66, 0.5, 5);
  navRLight.position.copy(tipR);
  airplane.add(navRLight);

  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strobeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), strobeMat);
  strobeL.position.set(tipL.x, tipL.y + 0.06, tipL.z);
  airplane.add(strobeL);
  const strobeR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), strobeMat);
  strobeR.position.set(tipR.x, tipR.y + 0.06, tipR.z);
  airplane.add(strobeR);
  const strobeLight = new THREE.PointLight(0xffffff, 0, 8);
  strobeLight.position.set(0, top.y * 0.5, 0);
  airplane.add(strobeLight);

  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  beaconMesh.position.set(top.x, top.y + 0.08, top.z);
  airplane.add(beaconMesh);

  const landingLight = new THREE.PointLight(0xfff6e0, 0, 30);
  landingLight.position.set(nose.x, nose.y - 0.2, nose.z + 0.5);
  airplane.add(landingLight);

  const engineGlow = new THREE.PointLight(0xff5522, 0.4, 9);
  engineGlow.position.set(0, tipL.y - 0.15, -Math.abs(nose.z) * 0.4);
  airplane.add(engineGlow);

  planeLights = { navLMesh, navRMesh, strobeL, strobeR, strobeLight, beaconMesh, landingLight, engineGlow };
}

function makeContrail() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(CONTRAIL_POINTS * 3);
  const ages = new Float32Array(CONTRAIL_POINTS).fill(1);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('age', new THREE.BufferAttribute(ages, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: [
      'attribute float age;',
      'varying float vAge;',
      'void main() {',
      '  vAge = age;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = (1.0 - age * 0.55) * 95.0 / max(1.0, -mv.z);',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying float vAge;',
      'void main() {',
      '  vec2 c = gl_PointCoord - 0.5;',
      '  float d = length(c);',
      '  float a = smoothstep(0.5, 0.12, d) * (1.0 - vAge) * 0.30;',
      '  gl_FragColor = vec4(0.85, 0.92, 1.0, a);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.head = 0;
  return points;
}

function emitContrail(trail) {
  if (!trail || !airplane) return;
  const tipWorld = trail.userData.tip.clone().applyMatrix4(airplane.matrixWorld);
  const pos = trail.geometry.attributes.position;
  const head = trail.userData.head;
  pos.setXYZ(head, tipWorld.x, tipWorld.y, tipWorld.z);
  trail.geometry.attributes.age.setX(head, 0);
  trail.userData.head = (head + 1) % CONTRAIL_POINTS;
  pos.needsUpdate = true;
}

function ageContrail(trail, dt) {
  if (!trail) return;
  const ages = trail.geometry.attributes.age;
  for (let i = 0; i < CONTRAIL_POINTS; i++) {
    const a = ages.getX(i);
    if (a < 1) ages.setX(i, Math.min(1, a + dt / CONTRAIL_LIFE));
  }
  ages.needsUpdate = true;
}

function resetContrails() {
  for (const trail of [contrailL, contrailR]) {
    if (!trail) continue;
    const ages = trail.geometry.attributes.age;
    for (let i = 0; i < CONTRAIL_POINTS; i++) ages.setX(i, 1);
    ages.needsUpdate = true;
  }
}

// Built nose-toward-+z with wings along x, matching the GLTF's convention —
// the airplane group's PI turn then points it down the flight path.
function createFallbackAirplaneModel() {
  const model = new THREE.Group();

  const fuselageMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.7, roughness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x1a5276, metalness: 0.5, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x87ceeb, metalness: 0.9, roughness: 0.1, emissive: 0x224466, emissiveIntensity: 0.3 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 7, 12), fuselageMat);
  fuselage.rotation.x = Math.PI / 2;
  model.add(fuselage);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), fuselageMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 3.5);
  model.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), windowMat);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, 0.15, 3.3);
  model.add(cockpit);

  const wings = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 2), accentMat);
  wings.position.set(0, -0.1, 0.3);
  model.add(wings);

  const wingTipGeom = new THREE.BoxGeometry(0.5, 0.15, 0.4);
  const wingTipL = new THREE.Mesh(wingTipGeom, accentMat);
  wingTipL.position.set(-3, -0.1, 0.3);
  model.add(wingTipL);
  const wingTipR = new THREE.Mesh(wingTipGeom, accentMat);
  wingTipR.position.set(3, -0.1, 0.3);
  model.add(wingTipR);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.2), accentMat);
  tailWing.position.set(0, 0.1, -3.2);
  model.add(tailWing);

  const vertTail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 1.5), accentMat);
  vertTail.position.set(0, 0.9, -3);
  model.add(vertTail);

  for (const side of [-1.5, 1.5]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.2, 8), darkMat);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side, -0.35, 0.3);
    model.add(engine);

    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8, side: THREE.DoubleSide });
    const exhaust = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.2, 8), exhaustMat);
    exhaust.position.set(side, -0.35, -0.3);
    model.add(exhaust);
  }

  model.scale.set(1.2, 1.2, 1.2);
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return model;
}

function createProceduralRunway() {
  runwayModel = new THREE.Group();

  const runwayLength = 80;
  const runwayWidth = 6;

  const asphaltGeo = new THREE.PlaneGeometry(runwayWidth, runwayLength);
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.85,
    metalness: 0.1,
  });
  const asphalt = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  runwayModel.add(asphalt);

  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    emissive: 0x444444,
    emissiveIntensity: 0.3,
    roughness: 0.5,
  });

  for (let side = -1; side <= 1; side += 2) {
    const edgeGeo = new THREE.PlaneGeometry(0.15, runwayLength);
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(side * (runwayWidth / 2 - 0.1), 0.01, 0);
    edge.receiveShadow = true;
    runwayModel.add(edge);
  }

  const centerDashMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    emissive: 0x555555,
    emissiveIntensity: 0.2,
    roughness: 0.5,
  });
  const dashLength = 2;
  const dashGap = 2;
  for (let z = -runwayLength / 2 + 2; z < runwayLength / 2 - 2; z += dashLength + dashGap) {
    const dashGeo = new THREE.PlaneGeometry(0.12, dashLength);
    const dash = new THREE.Mesh(dashGeo, centerDashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.01, z);
    runwayModel.add(dash);
  }

  const thresholdMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    emissive: 0x666666,
    emissiveIntensity: 0.3,
    roughness: 0.4,
  });
  for (let end = -1; end <= 1; end += 2) {
    for (let i = -3; i <= 3; i++) {
      const stripeGeo = new THREE.PlaneGeometry(0.35, 3);
      const stripe = new THREE.Mesh(stripeGeo, thresholdMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(i * 0.6, 0.01, end * (runwayLength / 2 - 2));
      runwayModel.add(stripe);
    }
  }

  const tdMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    emissive: 0x444444,
    emissiveIntensity: 0.2,
    roughness: 0.5,
  });
  for (let end = -1; end <= 1; end += 2) {
    for (let side = -1; side <= 1; side += 2) {
      const tdGeo = new THREE.PlaneGeometry(1.5, 6);
      const td = new THREE.Mesh(tdGeo, tdMat);
      td.rotation.x = -Math.PI / 2;
      td.position.set(side * 1.2, 0.01, end * 12);
      runwayModel.add(td);
    }
  }

  // Edge bulbs are emissive-only; two pooled point lights wash the strip.
  // (This used to spawn ~40 PointLights, which forward rendering pays for on
  // every material, every frame.)
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffcf70 });
  const lightGeo = new THREE.SphereGeometry(0.08, 6, 6);
  for (let side = -1; side <= 1; side += 2) {
    for (let z = -runwayLength / 2; z <= runwayLength / 2; z += 4) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(side * (runwayWidth / 2 + 0.3), 0.05, z);
      runwayModel.add(light);
    }
  }
  for (const z of [-20, 20]) {
    const wash = new THREE.PointLight(0xffaa33, 0.7, 34);
    wash.position.set(0, 0.6, z);
    runwayModel.add(wash);
  }

  const approachLightMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
  for (let i = -3; i <= 3; i++) {
    const aLight = new THREE.Mesh(lightGeo.clone(), approachLightMat);
    aLight.position.set(i * 0.8, 0.05, runwayLength / 2 + 1);
    runwayModel.add(aLight);
  }

  const endLightMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  for (let i = -3; i <= 3; i++) {
    const eLight = new THREE.Mesh(lightGeo.clone(), endLightMat);
    eLight.position.set(i * 0.8, 0.05, -runwayLength / 2 - 1);
    runwayModel.add(eLight);
  }

  runwayModel.position.set(0, -1.95, RUNWAY_Z);
  scene.add(runwayModel);
  console.log('Procedural runway created');
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

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

function buzz(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

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

function createGoldBurst(position) {
  const colors = [0xffd700, 0xffe27a, 0xfff3b0, 0xffc400];
  for (let i = 0; i < 26; i++) {
    const geometry = new THREE.SphereGeometry(0.06 + Math.random() * 0.1, 4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true,
      opacity: 1
    });
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.35,
      Math.random() * 0.3 + 0.08,
      (Math.random() - 0.5) * 0.35
    );
    particle.userData.life = 1.0;
    particle.userData.decay = 0.015 + Math.random() * 0.02;
    scene.add(particle);
    particles.push(particle);
  }
}

function clearEffects() {
  for (const exp of activeExplosions) scene.remove(exp);
  activeExplosions = [];
  for (const list of [particles, smokeParticles]) {
    for (const p of list) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
    }
    list.length = 0;
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

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let animTime = 0;
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function speedFactor() {
  if (gameState !== 'flying') return 1;
  return 1 + Math.min(1.2, Math.max(0, currentMultiplier - 1) * 0.1);
}

function updatePlaneEffects(dt) {
  if (!planeLights) return;
  const L = planeLights;

  // White strobes: double flash every 1.3s
  const p = animTime % 1.3;
  const strobeOn = p < 0.05 || (p > 0.15 && p < 0.2);
  L.strobeL.visible = strobeOn;
  L.strobeR.visible = strobeOn;
  L.strobeLight.intensity = strobeOn ? 2.2 : 0;

  // Red beacon: slow rotating-style pulse
  const b = Math.pow(Math.max(0, Math.sin(animTime * (Math.PI * 2) / 1.1)), 4);
  L.beaconMesh.visible = b > 0.1;
  L.beaconMesh.scale.setScalar(0.8 + b * 0.6);

  // Engine glow flickers while power is up
  const powered = gameState === 'flying' || gameState === 'takeoff' || gameState === 'transitioning';
  L.engineGlow.intensity = powered
    ? 1.0 + Math.sin(animTime * 43) * 0.18 + Math.random() * 0.08
    : 0.25;

  // Landing light: bright for takeoff, dims to cruise level once airborne
  let landing = 0.4;
  if (gameState === 'takeoff' || gameState === 'transitioning') landing = 2.4;
  else if (gameState === 'flying') {
    const airTime = (Date.now() - flightStartTime) / 1000;
    landing = airTime < 3 ? 2.4 - (airTime / 3) * 2.0 : 0.4;
  } else if (gameState === 'crashed') landing = 0;
  L.landingLight.intensity += (landing - L.landingLight.intensity) * 0.1;
}

function updateCityLife(dt) {
  for (const e of animatedBeacons) {
    e.mesh.visible = Math.sin(animTime * e.speed + e.phase) > 0.55;
  }
  for (const n of neonSigns) {
    let o = 0.55 + 0.4 * Math.max(0, Math.sin(animTime * n.speed + n.phase));
    if (Math.sin(animTime * 0.7 + n.phase * 3.1) > 0.995) o = 0.08; // rare dropout
    n.mat.opacity = o;
  }
  const refZ = airplane ? airplane.position.z : RUNWAY_Z;
  updateTraffic(dt, refZ);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = 0.016;
  animTime += dt;

  camLerpFactor += (camTargetLerp - camLerpFactor) * 0.03;
  if (nearMissCooldown > 0) nearMissCooldown -= dt;

  if (flySpeedRamp < 1 && gameState === 'flying') {
    flySpeedRamp = Math.min(1, flySpeedRamp + dt * 0.8);
  }

  let emitTrails = false;

  if (airplane) {
    if (gameState === 'flying' && flightPath) {
      if (runwayModel && airplane.position.z < RUNWAY_Z - 30) {
        runwayModel.visible = false;
      }
      const flyTime = (Date.now() - flightStartTime) / 1000;
      const fp = flightPath;
      const speedMultiplier = easeInOut(flySpeedRamp);

      // Integrate z so speed can evolve smoothly: exit takeoff fast, ease
      // toward cruise, then creep up as the multiplier climbs.
      const cruise = (4 + fp.speed * 6) * speedFactor();
      fp.curSpeed += (cruise - fp.curSpeed) * dt * 0.8;
      fp.zPos -= fp.curSpeed * dt;
      const currentZ = fp.zPos;

      const bobAmount = Math.sin(flyTime * 2) * 0.1 * speedMultiplier;
      const heightBase = airplaneBaseY + 2 + Math.sin(flyTime * 0.3) * 1.5 * speedMultiplier;

      const idleHeight = airplaneBaseY + 3;
      const flyHeight = heightBase + bobAmount;
      const blendedHeight = idleHeight + (flyHeight - idleHeight) * speedMultiplier;

      const lookAhead = 30 + fp.curSpeed * 1.6;
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

      // Near-miss: passing tight along a building face gives a camera punch
      if (nearMissCooldown <= 0) {
        for (const b of nearbyBuildings) {
          if (Math.abs(b.z - currentZ) < 2.2 &&
              airplane.position.y < b.y + b.height / 2 + 0.5) {
            const gap = Math.abs(airplane.position.x - b.x) - b.width / 2;
            if (gap > 0 && gap < 2.0) {
              fovPunch = 1;
              nearMissCooldown = 1.6;
              flashNearMiss();
              break;
            }
          }
        }
      }

      const dx = fp.weaveTargetX - airplane.position.x;
      const maxBank = 0.2 + 0.2 * speedMultiplier;
      const bankTarget = Math.max(-maxBank, Math.min(maxBank, dx * 0.15));
      airplaneCurrentBank += (bankTarget - airplaneCurrentBank) * 0.05;
      airplane.rotation.z = airplaneCurrentBank;

      const pitchOsc = Math.sin(flyTime * 0.7) * 0.03 * speedMultiplier - 0.02 * speedMultiplier;
      airplane.rotation.x = pitchOsc;
      airplane.rotation.y = Math.PI + airplaneCurrentBank * 0.25;

      emitTrails = flySpeedRamp > 0.4;

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
        if (airplane.position.y > -1.6) {
          airplane.position.y -= 0.12;
          airplane.rotation.x += 0.025;
          airplane.rotation.z += 0.03;
        }
      }
    } else if (gameState === 'takeoff' || gameState === 'transitioning') {
      const t = (Date.now() - takeoffStartTime) / 1000;
      const progress = Math.min(t / TAKEOFF_DURATION, 1);
      const postTakeoffTime = Math.max(0, t - TAKEOFF_DURATION);

      const accelCurve = progress * progress;
      const runwayLength = RUNWAY_Z + 20;
      let runZ = RUNWAY_Z - accelCurve * runwayLength;

      if (postTakeoffTime > 0) {
        const continueSpeed = 2 * runwayLength / TAKEOFF_DURATION;
        runZ -= postTakeoffTime * continueSpeed * 0.5;
      }

      const liftProgress = Math.max(0, (progress - 0.5) / 0.5);
      const liftEased = liftProgress * liftProgress * (3 - 2 * liftProgress);
      const groundY = -0.5;
      const flyY = airplaneBaseY + 3;
      const currentY = groundY + (flyY - groundY) * liftEased;
      const climbExtra = postTakeoffTime > 0 ? Math.min(postTakeoffTime * 0.5, 1.5) : 0;

      // Runway rumble while the gear is on the ground
      const rumble = progress < 0.55 ? Math.sin(animTime * 75) * 0.018 * (0.3 + progress) : 0;

      airplane.position.x += (0 - airplane.position.x) * 0.1;
      airplane.position.z = runZ;
      airplane.position.y = currentY + climbExtra + rumble;

      // Rotate: nose comes up as the plane lifts, with a slight flare
      const noseUp = liftEased * 0.13 + Math.sin(liftEased * Math.PI) * 0.03 + (postTakeoffTime > 0 ? 0.02 : 0);
      airplane.rotation.x = -noseUp;
      airplane.rotation.y = Math.PI;
      airplane.rotation.z *= 0.95;

      if (runwayModel) {
        runwayModel.visible = true;
        if (airplane.position.z < RUNWAY_Z - 30) runwayModel.visible = false;
      }

      recycleCityBuildings(runZ);
      emitTrails = liftProgress > 0.6;

      if (progress >= 0.85 && !serverStartRequested) {
        serverStartRequested = true;
        fetch('/api/game/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ betAmount: currentBet })
        })
          .then(r => r.json())
          .then(data => {
            if (data.error) {
              gameState = 'idle';
              serverStartRequested = false;
              updateBalance(balance + currentBet);
              setButtonState('bet');
              setBetInputsEnabled(true);
              return;
            }
            serverStartData = data;
          })
          .catch(() => {
            gameState = 'idle';
            serverStartRequested = false;
            updateBalance(balance + currentBet);
            setButtonState('bet');
            setBetInputsEnabled(true);
          });
      }

      if (progress >= 1 && gameState === 'takeoff') {
        gameState = 'transitioning';
      }

      if (gameState === 'transitioning' && serverStartData) {
        startTime = serverStartData.startTime; // multiplier clock (server)
        flightStartTime = Date.now();          // motion clock (visual, starts at 0)
        gameState = 'flying';
        flySpeedRamp = 0.3;
        generateFlightPath();
        flightPath.startZ = airplane.position.z;
        flightPath.zPos = airplane.position.z;
        flightPath.startX = airplane.position.x;
        flightPath.weaveTargetX = airplane.position.x;
        // Hand the integrator the speed the takeoff was moving at so the
        // takeoff→flight seam has no visible speed jump.
        flightPath.curSpeed = (2 * (RUNWAY_Z + 20) / TAKEOFF_DURATION) * 0.5;
        playEngineSound();
        setButtonState('cashout');
        runGameLoop();
        serverStartData = null;
      }
    } else {
      // Idle: hold parked position at the runway threshold
      airplane.position.x += (0 - airplane.position.x) * 0.05;
      airplane.position.z += (RUNWAY_Z - airplane.position.z) * 0.03;
      airplane.position.y += (-0.5 - airplane.position.y) * 0.05;

      airplane.rotation.x *= 0.95;
      airplane.rotation.z *= 0.95;
      airplane.rotation.y += (Math.PI - airplane.rotation.y) * 0.05;

      if (runwayModel) {
        runwayModel.visible = true;
      }

      recycleCityBuildings(airplane.position.z);
    }

    // Ground and stars follow the plane so long flights never outrun them
    if (groundMesh) groundMesh.position.z = airplane.position.z - 300;
    if (starField) starField.position.z = airplane.position.z;
  }

  // Contrails + plane light animation
  if (airplane) {
    airplane.updateMatrixWorld(true);
    if (emitTrails) {
      emitContrail(contrailL);
      emitContrail(contrailR);
    }
    ageContrail(contrailL, dt);
    ageContrail(contrailR, dt);
    updatePlaneEffects(dt);
  }
  updateCityLife(dt);

  const camOffsetX = 5;
  const camOffsetY = 10;
  const camOffsetZ = 16;
  const planePos = airplane ? airplane.position : new THREE.Vector3(0, -0.5, RUNWAY_Z);

  if (prevPlaneZ === null) prevPlaneZ = planePos.z;
  const planeVelZ = (planePos.z - prevPlaneZ) / dt;
  prevPlaneZ = planePos.z;

  let targetCamX = planePos.x + camOffsetX;
  let targetCamY = planePos.y + camOffsetY - 2;
  let targetCamZ = planePos.z + camOffsetZ;

  if (gameState === 'takeoff' || gameState === 'transitioning') {
    const t = (Date.now() - takeoffStartTime) / 1000;
    const progress = Math.min(t / TAKEOFF_DURATION, 1);
    targetCamX = planePos.x + 6 - progress * 2;
    targetCamY = planePos.y + 4 + progress * 5;
    targetCamZ = planePos.z + 14 + progress * 4;
    // Tighten the chase as the plane accelerates or it races out of frame
    camTargetLerp = 0.06 + progress * 0.14;
  } else if (gameState === 'flying' && airplane) {
    const t = (Date.now() - flightStartTime) / 1000;
    targetCamX += Math.sin(t * 0.15) * 1.5 * easeInOut(flySpeedRamp);
    targetCamY += Math.sin(t * 0.25) * 0.5 * easeInOut(flySpeedRamp);
    const spd = flightPath ? flightPath.curSpeed : 8;
    camTargetLerp = 0.09 + spd * 0.005;
  } else if (gameState === 'crashed') {
    camTargetLerp = 0.025;
  } else {
    targetCamX = planePos.x + 6;
    targetCamY = planePos.y + 5;
    targetCamZ = planePos.z + 14;
    camTargetLerp = 0.035;
  }

  // Feedforward: cancel most of the lerp lag behind a fast-moving plane so the
  // chase camera keeps it framed during the takeoff roll and early flight.
  if (gameState === 'takeoff' || gameState === 'transitioning' || gameState === 'flying') {
    const vel = Math.max(-70, Math.min(0, planeVelZ));
    targetCamZ += (vel / (60 * Math.max(0.05, camLerpFactor))) * 0.85;
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

  // FOV widens with speed and punches on near misses
  const targetFov = BASE_FOV + (speedFactor() - 1) * 6 + fovPunch * 7;
  fovPunch *= 0.9;
  if (Math.abs(camera.fov - targetFov) > 0.02) {
    camera.fov += (targetFov - camera.fov) * 0.08;
    camera.updateProjectionMatrix();
  }

  const lookAheadZ = -2 - (gameState === 'flying' && flightPath ? flightPath.curSpeed * 0.15 : 0);
  const lookTarget = airplane ? airplane.position.clone().add(new THREE.Vector3(0, 0, lookAheadZ)) : new THREE.Vector3(0, 0, RUNWAY_Z);
  if (!prevCamTarget) prevCamTarget = lookTarget.clone();
  prevCamTarget.lerp(lookTarget, camLerpFactor * 1.5);
  camera.lookAt(prevCamTarget);

  updateParticles();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

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
    el.textContent = value.toFixed(2) + 'x';
    el.className = '';
    el.style.color = '#00e676';
  } else {
    el.textContent = 'PLACE YOUR BET';
    el.className = 'waiting';
    el.style.color = '';
  }
}

function flashNearMiss() {
  const el = document.getElementById('multiplier-text');
  el.classList.add('nearmiss');
  if (nearMissTimer) clearTimeout(nearMissTimer);
  nearMissTimer = setTimeout(() => el.classList.remove('nearmiss'), 450);
}

function updateBalance(amount) {
  balance = Math.max(0, Math.floor(amount * 100) / 100);
  document.getElementById('balance').textContent = balance.toFixed(2);
  try { localStorage.setItem('skycrash_balance', String(balance)); } catch (e) {}
  const resetBtn = document.getElementById('reset-balance');
  if (resetBtn) resetBtn.style.display = balance < 1 ? 'inline-block' : 'none';
}

function loadBalance() {
  try {
    const v = parseFloat(localStorage.getItem('skycrash_balance'));
    if (isFinite(v) && v >= 0) balance = v;
  } catch (e) {}
}

function resetDemoBalance() {
  updateBalance(1000);
  document.getElementById('status-msg').textContent = 'Demo balance reset to 1000.00';
}

function updateStatsUI() {
  const el = document.getElementById('stat-profit');
  if (!el) return;
  const sign = sessionProfit >= 0 ? '+' : '−';
  let text = 'P/L ' + sign + Math.abs(sessionProfit).toFixed(2);
  if (biggestWin > 0) text += ' · Best +' + biggestWin.toFixed(2);
  el.textContent = text;
  el.classList.toggle('neg', sessionProfit < 0);
  el.classList.toggle('pos', sessionProfit > 0);
}

function showWinBanner(mult, winnings) {
  const el = document.getElementById('win-banner');
  if (!el) return;
  el.innerHTML = 'CASHED OUT @ ' + mult.toFixed(2) + 'x<span>+' + winnings.toFixed(2) + '</span>';
  el.classList.add('show');
  if (winBannerTimer) clearTimeout(winBannerTimer);
  winBannerTimer = setTimeout(() => el.classList.remove('show'), 2400);
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
  const input = document.getElementById('bet-amount');
  if (input.disabled) return;
  input.value = amount;
}

function halfBet() {
  const input = document.getElementById('bet-amount');
  if (input.disabled) return;
  input.value = Math.max(1, Math.floor(parseFloat(input.value) / 2));
}

function doubleBet() {
  const input = document.getElementById('bet-amount');
  if (input.disabled) return;
  input.value = Math.min(Math.min(balance, 100), parseFloat(input.value) * 2);
}

function setBetInputsEnabled(enabled) {
  document.getElementById('bet-amount').disabled = !enabled;
  document.querySelectorAll('.bet-quick-btn').forEach(btn => { btn.disabled = !enabled; });
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

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

async function handleAction() {
  if (gameState === 'idle') {
    await placeBet();
  } else if (gameState === 'flying' && !cashedOut) {
    await cashOut();
  }
  // Ignore during takeoff/transitioning/crashed states
}

async function placeBet() {
  const betAmount = parseFloat(document.getElementById('bet-amount').value);
  if (isNaN(betAmount) || betAmount <= 0) {
    document.getElementById('status-msg').textContent = 'Enter a valid bet amount';
    return;
  }
  if (betAmount > 100) {
    document.getElementById('status-msg').textContent = 'Max bet is 100';
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

  setBetInputsEnabled(false);
  setButtonState('waiting');
  updateMultiplierDisplay(0, 'waiting');
  document.getElementById('multiplier-text').textContent = 'TAKING OFF...';

  startTakeoff();
}

function startTakeoff() {
  gameState = 'takeoff';
  takeoffStartTime = Date.now();
  currentMultiplier = 1.00;
  flySpeedRamp = 0;
  serverStartRequested = false;
  serverStartData = null;

  if (airplane) {
    airplane.visible = true;
    airplane.position.set(0, -0.5, RUNWAY_Z);
    airplane.rotation.set(0, Math.PI, 0);
    airplaneCurrentBank = 0;
    airplane.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.transparent = false;
        child.material.opacity = 1;
      }
    });
  }

  camLerpFactor = 0.1; // start the chase tight so the roll doesn't outrun the camera

  playEngineSound();
}

function runGameLoop() {
  if (gameLoop) clearInterval(gameLoop);

  const localUpdate = setInterval(() => {
    if (gameState !== 'flying') {
      clearInterval(localUpdate);
      return;
    }
    const elapsed = (Date.now() - startTime) / 1000;
    currentMultiplier = Math.pow(Math.E, GROWTH_RATE * elapsed);
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
      const profit = result.winnings - currentBet;
      sessionProfit += profit;
      if (profit > biggestWin) biggestWin = profit;
      updateStatsUI();
      showWinBanner(result.multiplier, result.winnings);
      if (airplane) createGoldBurst(airplane.position.clone());
      buzz(40);
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
  buzz([60, 40, 90]);

  crashPoint = data.crashPoint;
  updateMultiplierDisplay(crashPoint, 'crashed');

  if (airplane) {
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
      // No building close enough — nosedive and blow up where the plane is
      setTimeout(() => {
        playExplosionSound();
        if (airplane) createExplosionParticles(airplane.position.clone());
        cameraShake = 1.5;
      }, 600);
    }
  } else {
    playExplosionSound();
    cameraShake = 1.5;
  }

  const overlay = document.getElementById('crash-overlay');
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 1000);

  if (!cashedOut) {
    sessionProfit -= currentBet;
    updateStatsUI();
    document.getElementById('status-msg').textContent =
      'Crashed at ' + crashPoint.toFixed(2) + 'x! Lost ' + currentBet.toFixed(2);
  }

  addHistoryItem(crashPoint, data.hash, data.commitment);

  setTimeout(startResetCountdown, 1400);
}

// Countdown → fade to black → rebuild the world at the runway → fade back in.
// This replaces the old reset, which lerped the plane (and camera) backward
// across the whole map into a city that no longer existed there.
function startResetCountdown() {
  const cd = document.getElementById('round-countdown');
  let n = 3;
  cd.textContent = 'NEXT ROUND IN ' + n;
  cd.classList.add('show');
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n--;
    if (n > 0) {
      cd.textContent = 'NEXT ROUND IN ' + n;
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      cd.classList.remove('show');
      fadeTransition(doWorldReset);
    }
  }, 900);
}

function fadeTransition(midCallback) {
  const f = document.getElementById('fade-overlay');
  f.classList.add('show');
  setTimeout(() => {
    midCallback();
    setTimeout(() => f.classList.remove('show'), 120);
  }, 420);
}

function doWorldReset() {
  gameState = 'idle';
  currentMultiplier = 1.00;
  cashedOut = false;
  flightPath = null;
  crashTarget = null;
  flySpeedRamp = 0;
  serverStartRequested = false;
  serverStartData = null;
  fovPunch = 0;
  nearMissCooldown = 0;

  clearEffects();
  rebuildCity();
  resetContrails();

  if (airplane) {
    airplane.visible = true;
    airplane.position.set(0, -0.5, RUNWAY_Z);
    airplane.rotation.set(0, Math.PI, 0);
    airplaneCurrentBank = 0;
    airplane.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.transparent = false;
        child.material.opacity = 1;
      }
    });
  }

  if (runwayModel) {
    runwayModel.visible = true;
  }

  // Snap the camera straight to the parked view — behind black, so no sweep
  camera.position.set(6, 4.5, RUNWAY_Z + 14);
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  prevCamTarget = airplane ? airplane.position.clone() : new THREE.Vector3(0, -0.5, RUNWAY_Z);
  camObstructionOffset.set(0, 0, 0);
  cameraShake = 0;

  updateMultiplierDisplay(0, 'idle');
  setButtonState('bet');
  setBetInputsEnabled(true);
  document.getElementById('status-msg').textContent = 'Provably Fair - SHA-256 Hash Chain';
}

document.addEventListener('DOMContentLoaded', () => {
  loadBalance();
  init3D();
  initAudio();
  updateBalance(balance);
  updateStatsUI();

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
