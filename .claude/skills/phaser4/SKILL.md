---
name: phaser4
description: Phaser 4 API reference (official docs bundled with the installed version). Use before writing Phaser code you're unsure of, when a Phaser call fails type-check or throws, or when touching filters, particles, physics, tilemaps, cameras, input, tweens or scenes.
---

# Phaser 4 reference router

The installed Phaser ships its own agent docs at `node_modules/phaser/skills/<topic>/SKILL.md` — always matching the installed version. Read the topic file for what you're touching; most have a `references/` folder for depth.

| Touching | Topic |
|---|---|
| Anything that worked in Phaser 3 but breaks now | `v3-to-v4-migration` (read this first when in doubt) |
| Filters, bloom, glow, blur, masks, vignette | `filters-and-postfx` — and see the ADD-blend gotcha in CLAUDE.md |
| Particles, emitters, explosions | `particles` |
| Arcade physics: bodies, colliders, overlap, velocity | `physics-arcade` |
| Matter physics: rigid bodies, joints, ragdolls | `physics-matter` |
| Tilemaps, Tiled/LDtk levels | `tilemaps` |
| Camera follow, shake, zoom, bounds | `cameras` |
| Keyboard, mouse, touch, gamepad | `input-keyboard-mouse-touch` |
| Tweens, easing, timelines | `tweens` |
| Scene lifecycle, launching overlay scenes, passing data | `scenes` |
| Sprites, animations, spritesheets | `sprites-and-images`, `animations` |
| Text, bitmap text | `text-and-bitmaptext` |
| Graphics, shapes | `graphics-and-shapes` |
| Render textures, drawing to textures | `render-textures` |
| Groups, containers | `groups-and-containers` |
| Timers, delayed calls | `time-and-timers` |
| Game config, scale modes, responsive | `game-setup-and-config`, `scale-and-responsive` |
| New v4-only objects (Gradient, Noise, SpriteGPULayer, lighting) | `v4-new-features` |

Other topics: `ls node_modules/phaser/skills`. For exact signatures, `grep` `node_modules/phaser/types/phaser.d.ts`.
