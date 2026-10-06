---
name: ship
description: Package a game as a standalone static site + itch.io-ready zip.
disable-model-invocation: true
argument-hint: "<slug>"
---

# Ship

1. `npm run check`, then `npm run shot -- <slug> --gpu --seconds 15` — stop and fix if either fails.
2. Make sure `games/<slug>/game.json` has a real title, tagline and controls, and the menu shows them.
3. `npm run ship -- <slug>` → `ship/<slug>/` (static site) and `ship/<slug>.zip`.
4. Tell the user where the zip is and how to publish: itch.io → New project → Kind: HTML → upload the zip → tick "This file will be played in the browser" → viewport 1280×720 → Save. Or drag `ship/<slug>/` onto app.netlify.com/drop.

Uploading anywhere is the user's call — hand over the zip; publish only if they explicitly ask.
