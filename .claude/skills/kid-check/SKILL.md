---
name: kid-check
description: Find 5 UI problems a kid would point out in a game and pre-build a fix for each, so "fix 2" is instant. Use as the last step of every game build, when asked to find problems / review a game, and when the user says "fix 3", "fix all", or names one of the listed problems.
---

# Kid check

After a game is built, play it like a kid would and find **5 UI problems anyone notices within a minute of playing** — then implement every fix now, save each as a patch, and roll it back. The user picks which to apply; applying is one command. Budget: ~8 minutes for the whole check.

## If the user says "fix N" / "fix all" / names a listed problem

1. `npm run fixes -- apply <slug> <N>` (or `all`). It applies the staged patch, type-checks, and ticks it off in `games/<slug>/FIXES.md`.
2. Confirm with one targeted screenshot of that UI (`npm run shot -- <slug> --gpu` plus `--query`/`--eval` to reach the moment), then reply in one or two lines.
3. If it reports a conflict (two fixes touched the same lines), re-implement that fix from its plan in FIXES.md.

## Running a check

1. **Snapshot:** `npm run fixes -- start <slug>`.
2. **Play it like a kid.** `npm run shot -- <slug> --gpu --seconds 20`, plus a short scripted Playwright run that reaches the moments a kid sees: the menu, the first 10 seconds, the core action, getting hit, winning/losing, retrying. Look at every screenshot.
3. **Pick 5 UI problems.** UI only: menus, HUD, text, labels, buttons, icons, prompts, banners, counters, overlays, the game-over screen. Not gameplay, camera, physics, AI, art or difficulty. Each one must be:
   - **Kid-obvious.** Seen on screen, not found in code. Say it the way a kid would: *"I can't read the words!"*, *"What do those bars mean?"*, *"The score goes off the screen!"*, *"It says press X but X doesn't do that!"*, *"I didn't see the countdown!"*.
   - **Real.** You saw it in a screenshot. Never invent one.
   - **Quick.** Fixable in under 5 minutes.
   - **Independent.** Touches different lines from the other four, so any subset applies cleanly. Patches carry 3 lines of context, so keep edits at least 7 lines apart or in different files.

   Places to look, most obvious first: text too small, low-contrast, or over a busy background · text overlapping, cut off, or wrapping badly · HUD elements with no label or meaning · a prompt that names the wrong key or action · important moments (countdown, goal, level up, damage, low health) with no clear on-screen signal · stale or leftover UI (old messages, wrong numbers, empty bars) · elements colliding with each other or the screen edge · the menu and game-over screens: can you tell how to start, retry, and quit? · mobile width (`--query` plus a 390×844 viewport) if the game supports touch.
4. **Stage each fix**, one at a time: implement it → verify (type-check + a screenshot of the exact moment) → `npm run fixes -- save <slug> <n>` (saves `fixes/<n>.patch` and rolls the game back to the base).
5. **Prove they apply:** `npm run fixes -- apply <slug> all`, one screenshot run, then `npm run fixes -- undo <slug> all`. If two patches conflict, rework one so they're independent.
6. **Write `games/<slug>/FIXES.md`:**

   ```markdown
   # Kid check — <Title>
   Apply with `npm run fixes -- apply <slug> <n>` (or `all`). Each patch was made and tested against the same base.

   ## ⬜ 1. "What do those bars mean?"
   - **What you see:** <one sentence, where and when>
   - **Why:** <the cause, one sentence>
   - **Fix (staged):** <what the patch changes, one sentence>
   ```
   Headings must keep the `## ⬜ <n>. ` prefix — the script ticks them to ✅.
7. **Report in chat:** the 5 UI problems as a numbered list, kid-phrased, each with a one-line fix, ending with: *Say "fix 2", "fix 1 and 4", or "fix all".*

Done when: five patches exist in `games/<slug>/fixes/`, all five apply together cleanly, the game is back at its base state, FIXES.md is written, and the list is in chat.
