# Hollow House

> She's coming. Hide. Fight. Escape.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
First-person horror survival with light RPG progression, in the spirit of Granny. You're trapped in Grandma's house. She can't be killed and hunts you by sight and sound. Zombies roam the halls and can be fought for XP. Find 3 keys and escape through the front door within 5 days.

## Core loop
- **Verbs:** sneak (crouch = silent) / sprint (fast but loud), hide (wardrobes, under beds), swing the frying pan.
- **Reward:** keys, medkits, batteries; zombie kills → XP → level-up perk cards (pick 1 of 3).
- **Tension:** Grandma patrols → hears noise (footsteps, door creaks, fights, zombies banging on doors) → investigates → sees you (FOV + line of sight; flashlight makes you visible from further) → chases. Lose her by breaking line of sight or hiding — but if she sees you climb in, she drags you out.
- **Fail:** caught by Grandma or HP 0 → lose a day, wake in your bedroom (keep items/levels). Grandma gets faster each day. Day 5 gone → game over.
- **Win:** all 3 keys → front door (living room).

## Controls
WASD · mouse look (click to lock) · Shift sprint · C/Ctrl crouch · Left click (or Q) swing · E interact/hide/exit · F flashlight · M mute · Esc pause

## Code map
- `config.ts` — all tuning (`?tune` sliders)
- `house.ts` — ASCII map (legend at top), procedural textures, walls/doors/furniture, hiding spots, collision, line of sight, A* paths (Grandma opens doors, zombies don't)
- `actors.ts` — `Grandma` (patrol / investigate / search / chase / grab / stunned) and `Zombie` (wander / chase / telegraphed attack / bang on doors) with box-built models
- `main.ts` — player controller, flashlight, frying-pan combat, interaction, items/keys, perks, days, caught/jump-scare, spatial audio, HUD
- Shared cube debris lives in `kit/three/debris.ts`

## Debug
`?god` (no catch, no damage) · `?nogranny` · `?keys=3` · `?level=2` · `?freelook` (mouse look without pointer lock) · `?tune` (+ buttons: level up, all keys, Grandma chase, spawn zombie). `window.__debug` exposes P, house, grandma, zombies, interact, swing.

## Verified (headless, Apple M2)
- 60 fps in every room (p95 ≈ 18 ms) with shadowed flashlight + 10 lights.
- Scripted run: door → hallway → zombie killed in 2 hits → perk card → spotted → wardrobe hide/exit → caught (jump scare) → Day 2 respawn → escape with 3 keys.
- AI soak: noisy sprinting player → Grandma goes patrol → investigate → chase on her own.

## Assets used
Poly Haven `wood_floor_worn`, `decrepit_wallpaper`, `painted_plaster_wall`; Kenney `furniture-kit` (beds, cupboards-as-wardrobes, sofas, desk, kitchen table + chairs, fridge, bathtub, TV, rugs, ceiling lamps — placed per room in `House.dress()`), `graveyard-kit/character-zombie` (animated), `mini-characters/character-female-c` as Grandma (pale tint, red face glow when hunting, `survival-kit/tool-shovel`), `food-kit/frying-pan` viewmodel, `mini-dungeon/key` + `potion`. Sounds: `impact-sounds` footsteps/impacts, `rpg-audio` doors/creaks/cloth/keys. Scream, heartbeat, groans, sting stay procedural.

## Status
- [x] House, lighting, flashlight + battery, doors, hiding, items, 3 keys, exit
- [x] Grandma AI (hearing, sight, doors, search, grab-from-hiding, stun), jump scare, days
- [x] Zombies (wander/chase/door-banging/telegraphed attacks), XP, 10 perks
- [ ] Not verified by a human: audio mix (footstep loudness, heartbeat), mouse sensitivity feel, difficulty
- [ ] Touch controls

## Ideas / next
- Second floor + basement with stairs; traps (bear traps, creaky floorboards)
- Items that combine (pliers + padlock, hammer + boards) like Granny
- Throwable objects to make distraction noise
- Grandpa / a second hunter on later days; pet that alerts Grandma
- Random house layouts from room templates
