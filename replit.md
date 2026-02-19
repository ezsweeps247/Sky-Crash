# Sky Crash 3D - Mobile Web Crash Game

## Overview
A 3D crash game built with Three.js featuring a Boeing 707 airplane navigating through a night city skyline. Players bet and cash out before the plane crashes. Uses provably fair SHA-256 hash chain for crash point determination.

## Architecture
- **Backend**: Node.js + Express server on port 5000
- **Frontend**: Vanilla JS + Three.js (r128) for 3D rendering
- **Provably Fair**: SHA-256 hash chain with HMAC for crash point generation
- **3D Models**: GLTF format - Boeing 707 airplane + Low Poly Night City Skyline
- **Sound**: Engine loop (WAV) + Explosion (FLAC)

## Project Structure
```
server.js                    - Express backend with provably fair engine
public/
  index.html                 - Main game page
  css/style.css              - Game UI styling
  js/game.js                 - Three.js 3D scene + game logic
  models/airplane/           - Boeing 707 GLTF model + textures
  models/city/               - Night city skyline GLTF model + textures
  sounds/                    - Engine and explosion audio
```

## Key Features
- 3D city buildings with procedural windows and lit skyline
- Boeing 707 airplane with navigation lights and engine glow
- Provably fair crash determination (SHA-256 HMAC hash chain)
- Auto-cashout functionality
- Round history with verification modal
- Explosion particles and camera shake on crash
- Mobile-responsive UI

## API Endpoints
- GET /api/game/new - Start a new round
- POST /api/game/start - Begin flying phase
- POST /api/game/tick - Server-side crash check
- POST /api/game/cashout - Cash out at current multiplier
- GET /api/game/history - Previous round history
- GET /api/game/verify/:hash - Verify a round hash

## 3D Model Credits (CC-BY-4.0)
- Airplane: "boeing 707 (burnout 3)" by amogusstrikesback2
- City: "Low Poly Night City Building Skyline" by 99.Miles
