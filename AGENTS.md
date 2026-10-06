# Game Forge

A browser-game workshop: shared kit + genre templates + headless playtesting, so a game goes from prompt to playable in one session. Many games live side by side in `games/<slug>/`; every one with a `game.json` appears on the arcade launcher at `/`.

**First run in a fresh clone:** if `node_modules/` is missing, run `npm run setup` (installs deps + headless Chromium for playtests). Node ≥ 20.19.

**To build a new game, follow `.claude/skills/make-game/SKILL.md`** (design → scaffold → core verb → loop → playtest → hand-off) and its checklist `.claude/skills/make-game/game-feel.md`. Other procedures in `.claude/skills/`: `playtest/`, `polish/`, `ship/`, and `phaser4/` (Phaser API router).

**Working on an existing game: read `games/<slug>/GAME.md` first and update it when you change the design.** It is that game's memory across sessions.

## Stack

- **Phaser 4** (2D, default) · **Three.js** (3D) · Vite + TypeScript (strict) · ZzFX procedural sound · Tweakpane live tuning · no asset files needed — art and audio are generated in code.
- Phaser 4 is NOT Phaser 3. For any Phaser API you're unsure of, read the official v4 docs shipped in `node_modules/phaser/skills/<topic>/SKILL.md` (index: `.claude/skills/phaser4/SKILL.md`). `npm run check` catches most v3-isms.
- Type-check after every change (`npm run check`, ~1s).

## Layout

- `kit/` — engine-agnostic: `audio` (sfx presets, music sequencer, `audio.output` bus), `tune` (live sliders on `?tune`), `director` (waves/spawn budget), `upgrades` (pick-1-of-N), `grid` (A*, flood fill, ASCII), `fsm`, `pool`, `spatial`, `math`, `rng`, `save`, `input` (Three/canvas).
- `kit/phaser/` — `boot` (`bootPhaser`, `playtest()`), `menus` (`menuScene`, `gameOverScene`), `scenes` (`go`, `enablePause`), `cards` (`chooseCard`), `textures` (procedural art), `juice`, `ui`, `level` (`buildLevel`), `touch` (`TouchPad`).
- `kit/three/` — `boot` (`bootThree`: renderer, bloom, shadows, resize, loop, HTML HUD, shake), `debris` (instanced cube particles).
- Each kit file's header comment is its usage doc. Read it before using the module.
- `templates/` — `blank`, `topdown`, `platformer`, `puzzle`, `physics`, `3d`. Each is a complete, playtested game; `npm run new` with no args describes them.
- Reference games: `games/neon-swarm` (polished 2D: pools + spatial hash, waves, upgrades, overlay scenes), `games/block-racer` (3D voxel racing: chunked InstancedMesh world, texture atlas, arcade drift physics), `games/hollow-house` (first-person horror: pointer lock, grid A* AI with hearing/sight, hiding, spatial audio).

## Commands

`npm run new` (list) · `npm run new -- <slug> --template <t>` / `--from <game>` · `npm run play -- <slug> [query]` · `npm run shot -- <slug>` · `npm run check` · `npm run ship -- <slug>` (itch.io zip) · `npm run build` (whole arcade)

## Playtesting

`npm run shot -- <slug> [--gpu] [--seconds N] [--query "god&wave=5"] [--eval "<js>"] [--no-bot] [--no-click]` boots Vite, opens the game headless, bot-mashes inputs, saves screenshots to `.shots/<slug>/`, prints `window.__playtest` state + fps, exits 1 on any runtime error.
- `--gpu` renders on the real GPU — use it when judging visuals or fps. Default is software GL: slower, fine for error checks.
- `--eval` runs JS after start to force states: `--eval "__game.scene.getScene('Play').xp = 99"`. 3D games expose `window.__debug` for the same purpose.
- Publish state from the game with `playtest({ score, wave, ... })` (Phaser) or `window.__playtest = {...}` (Three). Read the screenshots; a clean exit only proves nothing threw.
- For anything the random bot can't do (drift, aim, hide), write a short Playwright script that drives real key/mouse input and logs `__playtest` over time.
- An fps reading taken right after a screenshot dips (the capture stalls rendering). Measure fps with a `requestAnimationFrame` loop instead.
- Headless Chromium can't pointer-lock: first-person games should accept a `?freelook` param.

## Phaser 4 gotchas (verified in this repo, 4.2.1)

- **Camera filters + ADD blend = black boxes.** Any `camera.filters` effect (`AddEffectBloom`, vignette, glow) renders dark quads where ADD-blended sprites/particles overlap. Pick one per scene: ADD blend with glow baked into textures, or NORMAL blend with camera bloom. Vignette: use the `vignette()` texture overlay.
- **Never scale Matter objects from 0** (spawn tweens, squash): `setScale` also rescales the physics body → NaN. Fade alpha instead.
- Camera effects (`zoomTo`, `pan`) need exact EaseMap names: `'Quad.easeOut'`. Tweens accept `'Quad.Out'`.
- `group.children` is a native `Set`: iterate `group.getChildren()`.
- `setTintFill` is gone: `setTint(c).setTintMode(Phaser.TintModes.FILL)`; restore with `MULTIPLY`.
- `Math.TAU` is now 2π. `Geom.Point` is gone (use `Vector2`). Body setters return `Body | StaticBody`; call `setMaxVelocityY` etc. on a separate line. Matter bodies: `this.matter.world.getAllBodies()`.
- A Scene field named `time` shadows the scene clock. Use `elapsed`.

## Three.js notes (r186)

- Draw many identical blocks with one `InstancedMesh` per block type, UVs baked into an atlas (see `games/block-racer/blocks.ts`) — one draw call each.
- `THREE.Clock` is deprecated; `bootThree` uses `THREE.Timer`.
- Anything indexed by "progress" (biomes, levels) must handle negative values if the player can reverse.
