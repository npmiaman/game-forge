---
name: playtest
description: Bot-play a game headless, look at the screenshots, report what's broken or unfun, and fix it.
disable-model-invocation: true
argument-hint: "<slug> [what to focus on]"
---

# Playtest

Target: `$ARGUMENTS` (first word = game slug in `games/`; the rest = what the user wants checked). If no slug, use the game most recently worked on in this session, else ask.

1. Read `games/<slug>/GAME.md` to know what the game is supposed to do.
2. Run `npm run shot -- <slug> --gpu --seconds 20`. Add `--query` debug params (`god`, `wave=`, `level=`) and `--eval` to force states the bot can't reach on its own (late game, boss, level-up, win screen). Run several times as needed to cover menu → play → escalation → game over → retry.
3. Read every screenshot. Compare against GAME.md and [game-feel.md](../make-game/game-feel.md). Look for: runtime errors, things off-screen or overlapping, unreadable text, nothing happening, too easy/too hard (from `__playtest` state: score/kills/hp over time), missing feedback.
4. Fix what you found, re-run the playtest, read the screenshots again.

Done when: a clean run (exit 0), screenshots show the full loop working, and you've told the user each issue found → fix made, plus anything you couldn't verify headless (sound, feel under real hands).
