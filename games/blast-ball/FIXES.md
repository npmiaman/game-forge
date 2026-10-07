# Kid check — Blast Ball
Apply with `npm run fixes -- apply blast-ball <n>` (or `all`); undo with `npm run fixes -- undo blast-ball <n>`. Each patch was made against the same base and all five were tested applied together.

## ⬜ 1. "It says right click is SHOOT but it kicks the ball! And I can't even read it."
- **What you see:** when you have the ball, a tiny grey line under your feet says "hold RIGHT CLICK to shoot", but shooting is left click and right click kicks.
- **Why:** wrong verb in the hint text, 9px grey font with no background.
- **Fix (staged):** "⚽ YOUR BALL — hold RIGHT CLICK or SPACE to KICK" in yellow 13px text on a dark pill.

## ⬜ 2. "I didn't see the countdown, the game just started!"
- **What you see:** the 3-2-1 before kickoff is a 12px grey digit under the scoreboard.
- **Why:** the countdown reuses the small `#sub` status line.
- **Fix (staged):** a 96px countdown in the middle of the screen, then a "GO!" banner with the whistle.

## ⬜ 3. "What are those bars at the bottom? The top one is always empty."
- **What you see:** three unlabelled bars under your player; the top one (armor) stays empty until you pick up armor.
- **Why:** no labels, and the armor bar is shown at 0.
- **Fix (staged):** HEALTH / SPRINT / ARMOR labels; the armor bar appears only once you have armor.

## ⬜ 4. "When I get knocked out the camera goes inside my body!"
- **What you see:** after a knockout, the screen fills with your own fallen character's back for 4 seconds.
- **Why:** the third-person camera keeps its normal offset while the body lies flat right in front of it.
- **Fix (staged):** while knocked out, the camera smoothly rises up and back and looks down at your body and the pitch, then returns when you respawn.

## ⬜ 5. "The words on the start screen are too small to read."
- **What you see:** the controls on the menu are 9px white text straight over the busy stadium.
- **Why:** tiny font, no backing.
- **Fix (staged):** 11px text on a dark panel, fits on three lines at 1280px.
