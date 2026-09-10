# Blockcraft 2.5D — Isles at War

A browser-first voxel sandbox and lightweight RTS built with Three.js.

## Modes

- **Explore Islands** — run, jump, orbit the camera, and place or remove blocks.
- **Strategy Mode** — choose Forestkin, Mountainfolk, or Sulfurborn; gather
  resources, construct groves, barracks, and towers, set rally points, capture
  runestones, and destroy the opposing strongholds.

## Controls

- `WASD` / arrows — move
- `Shift` — sprint
- `Space` — jump
- Drag — orbit camera
- Wheel — zoom
- Sandbox: left click breaks, right click places, `1–9` chooses a block
- Strategy: choose a building and left click to construct; right click sets rally

The atlas in `voxv2-textures.js` is extracted from the checked-in
`VoxV2BlockArray.asset`: 30 blocks × 6 faces, reduced to the original 4×4
logical pixels and nearest-neighbour scaled at runtime.

Open `index.html` through any static web server.
