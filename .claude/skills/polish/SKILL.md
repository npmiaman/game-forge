---
name: polish
description: Game-feel pass — add juice, sound, feedback and flow until the game feels great to play.
disable-model-invocation: true
argument-hint: "<slug> [area, e.g. 'combat' or 'menus']"
---

# Polish

Target: `$ARGUMENTS` (first word = game slug; rest = optional focus area).

1. Read `games/<slug>/GAME.md` and the game's Play scene.
2. Walk every line of [game-feel.md](../make-game/game-feel.md) against the code. For each item: present, missing, or not applicable to this genre.
3. Implement the missing ones, highest impact first: the core verb's feedback, then hits/kills, then damage, then rewards, then flow. Use the kit (`Juice`, `sfx`, `music.setIntensity`, `tune`) rather than hand-rolling.
4. Expose any new tuning numbers in `config.ts` so they show in `?tune`.
5. Playtest with `npm run shot -- <slug> --gpu` and read the screenshots.

Done when: every checklist line is present or consciously skipped (say which and why), the playtest is clean, and GAME.md's Status reflects the pass.
