# Block Racer

> Drift through an endless voxel world. Smash crates, launch off ramps, beat the clock.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
Minecraft-style blocky world meets arcade checkpoint racing (OutRun / Mario Kart drift-boost). Endless procedurally generated voxel highway through biomes; race the timer, checkpoints add time.

## Core loop
- **Verb:** steer + drift. Hold Space/Shift while turning → sparks charge blue → orange → purple → release for Boost / Super / Ultra boost.
- **Reward:** speed, smashing wooden crates into voxel debris, gold blocks (+score, +time), TNT launches you (and chain-destroys nearby blocks), ramps for air time, Super+ boost smashes stone.
- **Escalation:** each checkpoint (every 450m) raises top speed, makes the track curvier, adds more obstacles/walls, changes biome (Plains → Desert → Snowy Peaks → The Nether → repeat). Checkpoint time bonus = time to drive the next stretch × a factor that shrinks each checkpoint, so the clock always wins eventually.
- **Fail:** timer hits 0 → TIME UP → Space/R instant retry. Score = metres + bonuses; best saved.

## Controls
W/↑ gas · S/↓ brake (then reverse) · A/D steer · Space/Shift drift · R restart · Esc pause · M mute. Gamepad: RT gas, LT brake, RB/X drift.

## Code map
- `config.ts` — every tuning number (all live-tunable with `?tune`)
- `blocks.ts` — procedural 16px pixel textures → atlas; per-block-type geometry with baked UVs
- `world.ts` — track centre line `xc(t)`, biomes, chunked voxel terrain (InstancedMesh per block type per chunk), obstacles, ramps, gates
- `car.ts` — voxel car mesh · `fx.ts` — instanced cube debris + engine/tyre-squeal synth
- `main.ts` — state machine, car physics (heading vs velocity angle = drift), collisions, camera, HUD, autopilot

## Tuning
All numbers in `config.ts`. `?tune` for live sliders (+ "+30s" and "Next checkpoint" buttons).

## Debug URL params
- `?tune` — live tuning panel
- `?god` — timer frozen
- `?auto` — autopilot drives (also used for the menu attract mode)
- `?cp=6` — start just before checkpoint 6
- `window.__debug = { world, xc, C }` for playtest scripts

## Verified (headless, Apple M2)
- 60 fps throughout; ~14 chunks live.
- Autopilot (no drifting) full run: 131s, 3.9km, checkpoint 8, then TIME UP.
- Scripted human input: gas → drift charges → release → boost fires.

## Assets used
Kenney `car-kit/race` (player car, wheels spin/steer), `impact-sounds` (crates, crashes), `sci-fi-sounds` explosion (TNT), `voiceover-pack` (go / objective achieved / time over). The voxel world, engine synth and music stay procedural.

## Status
- [x] Core driving, drift-boost, crates/stone/TNT/coins/boost pads/ramps, 4 biomes, checkpoints, timer, menu attract mode, time-up + best
- [x] Reverse (S when stopped) so you can back off a wall
- [ ] Touch controls
- [ ] Sound check by a human (engine pitch/gears, squeal levels) — not verifiable headless

## Ideas / next
- Ghost car of your best run
- Mine-able power-ups: drive through ore blocks for temporary abilities (diamond = shield, redstone = nitro)
- Rival AI racers / creepers that wander onto the road
- Day/night cycle, torches along the road at night
- Track editor where you place blocks
