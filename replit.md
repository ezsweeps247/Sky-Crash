# Sky Crash 3D - Mobile Web Crash Game

## Overview
A 3D crash game built with Three.js featuring a Boeing 707 airplane navigating through an infinite procedural night city. Players bet and cash out before the plane crashes. Uses provably fair SHA-256 hash chain for crash point determination. The plane flies continuously, weaving between buildings, and the city regenerates endlessly ahead.

## Architecture
- **Backend**: Node.js + Express server (configurable PORT, defaults to 5000)
- **Frontend**: Vanilla JS + Three.js (r128) for 3D rendering
- **Database**: PostgreSQL via Neon DB (optional, graceful fallback to in-memory)
- **Provably Fair**: SHA-256 hash chain with HMAC for crash point generation
- **3D City**: Infinite procedural city with segment-based recycling system
- **3D Models**: GLTF format - Boeing 707 airplane + Sparks/Explosion effect
- **Sound**: Engine loop (WAV) + Explosion (FLAC)
- **Deployment**: Railway with Nixpacks builder

## Project Structure
```
server.js                    - Express backend with provably fair engine
public/
  index.html                 - Main game page
  css/style.css              - Game UI styling
  js/game.js                 - Three.js 3D scene + game logic
  models/airplane/           - Boeing 707 GLTF model + textures
  models/explosion/          - Sparks/explosion GLTF model + textures
  sounds/                    - Engine and explosion audio
```

## Key Features
- Infinite procedural city with segment-based building recycling
- Boeing 707 airplane always in motion, weaving between buildings
- Building-aware flight path that dodges corridor buildings dynamically
- Aircraft lighting rig (blinking beacon, double-flash strobes, nav lights,
  landing light) positioned from the model's real geometry, plus wingtip
  contrails and flickering engine glow
- Provably fair crash determination (SHA-256 HMAC hash chain)
- Plane crashes into nearby building when crash point is reached
- Smooth round loop: crash → countdown → fade to black → world rebuilt at the
  runway → fade in, so every takeoff faces a fresh skyline
- Auto-cashout functionality
- Cashout win banner with gold burst; near-miss camera punches; FOV widens
  with speed as the multiplier climbs (multiplier growth rate 0.12, shared
  GROWTH_RATE constant in server.js and game.js)
- Session P/L + biggest-win stats; demo balance persisted in localStorage
- Round history with verification modal
- Explosion particles and camera shake on crash
- Mobile-responsive UI (vibration feedback on cashout/crash)

## City System
- Buildings spawn in segments ahead of the plane
- Windows are baked into shared canvas textures (color + emissive maps) with
  per-face UV mapping so window size stays constant in world units — one mesh
  per building instead of hundreds of window meshes
- Corridor buildings placed on alternating sides for weaving
- Outer buildings fill the background cityscape; some towers are tiered and
  carry rooftop water tanks/AC units, blinking aviation beacons, neon strips
- Street level: road with markings under the flight corridor, street lamps
  with glow pools, and a small pool of moving cars
- Segments are recycled (meshes disposed, metadata pruned) when behind camera;
  shared materials are never disposed
- Between rounds the entire city is rebuilt around the runway so round 2+
  never flies through the hollowed-out corridor of the previous flight
- Building metadata arrays (buildingPositions, corridorBuildings) stay in sync with rendered segments

## Flight System
- Idle: Plane sits parked on the runway, awaiting bet
- Takeoff: Plane accelerates down runway with rumble, rotates and lifts off
  (3.5 second sequence)
- Flying: motion uses an integrated speed that eases from takeoff speed toward
  cruise and creeps up with the multiplier; plane dodges corridor buildings
- Crashed: Plane nosedives into a nearby building (never a distant one) or the
  ground, explosion at impact
- Reset: countdown → fade to black → plane re-parked, camera snapped, city
  rebuilt → fade in
- Camera: speed-aware chase with velocity feedforward so the plane stays
  framed during the takeoff roll; separate visual motion clock keeps flight
  position free of jumps (the server clock drives only the multiplier)

## API Endpoints
- GET /api/game/new - Start a new round (returns commitment hash)
- POST /api/game/start - Begin flying phase
- POST /api/game/tick - Server-side crash check (compares multiplier vs crash point)
- POST /api/game/cashout - Cash out at current multiplier
- GET /api/game/history - Previous round history
- GET /api/game/verify/:hash - Verify a round hash
- GET /api/game/seed - Get chain head and salt for verification

## Provably Fair System
1. Server generates SHA-256 hash chain (10,000 hashes) on startup
2. Each round: commitment = SHA256(round_hash) sent to client before round
3. Crash point = HMAC-SHA256(round_hash, salt), first 8 hex chars → integer, crashPoint = max(1.00, (2^32 / (int+1)) * 0.97)
4. On crash: actual hash revealed for independent verification
5. Chain verification: SHA256(current_hash) === previous_round_hash

## 3D Model Credits (CC-BY-4.0)
- Airplane: "boeing 707 (burnout 3)" by amogusstrikesback2
- Runway: "RUNWAY" by pranav27
- Explosion: "Sparks/explosion" by OPREXT
