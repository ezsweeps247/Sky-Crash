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
- Provably fair crash determination (SHA-256 HMAC hash chain)
- Plane crashes into nearby building when crash point is reached
- Auto-cashout functionality
- Round history with verification modal
- Explosion particles and camera shake on crash
- Mobile-responsive UI

## City System
- Buildings spawn in segments ahead of the plane
- Corridor buildings placed on alternating sides for weaving
- Outer buildings fill the background cityscape
- Segments are recycled (meshes disposed, metadata pruned) when behind camera
- Building metadata arrays (buildingPositions, corridorBuildings) stay in sync with rendered segments

## Flight System
- Idle: Plane sits on runway, awaiting bet
- Takeoff: Plane accelerates down runway and lifts off (3.5 second sequence)
- Flying: Plane flies through city, dynamically dodges corridor buildings
- Crashed: Plane nosedives into nearest tall building, explosion at impact
- Camera follows plane at all times with smooth tracking

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
