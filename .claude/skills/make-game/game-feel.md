# Game feel checklist

The difference between "works" and "fun" is almost entirely here. Every line maps to a kit call.

## Core verb (fires every second — make it crunchy)
- Sound on every action (`sfx.play`), pitch-varied (ZzFX randomness does this).
- Visual kick: muzzle flash / dust puff / squash (`juice.burst`, `juice.squash`).
- Tiny recoil or anticipation on the actor.

## Hits and kills
- Target flashes white (`juice.flash`), gets knocked back.
- Particles in the target's colour (`juice.burst`), bigger for bigger things.
- Screen shake scaled to importance (`juice.shake(0.1)` small, `0.6+` huge). Never constant.
- Hitstop 40–90ms on heavy hits (`juice.hitstop`), 150ms+ on boss kills.
- Floating numbers / "+score" (`juice.pop`), crits bigger and yellow.

## Player damage
- Big shake + hitstop + red screen flash + sound + music duck (`music.duck`).
- Invulnerability frames with blink. Push enemies away so damage is never a death spiral.

## Rewards
- Pickups magnetise toward the player; rising pitch on rapid pickups (`sfx.play('pickup', { freq })`).
- Level-up / milestone: pause, slow-mo, ring burst, zoom punch, a jingle (`sfx.notes`).
- Combo/multiplier that the HUD pops when it grows.

## Movement
- Acceleration + damping (`damp()`), not instant velocity. Snappy > floaty.
- Platformers: coyote time, jump buffer, variable jump height (see templates/phaser).
- Dash/dodge with i-frames and afterimages for action games.
- Camera follows with lerp and looks ahead toward aim/movement.

## Escalation and fairness
- Difficulty ramps continuously; new enemy types/mechanics introduced one at a time with a banner.
- Telegraph every threat (spawn markers, wind-up lines, flashing) — deaths should feel deserved.
- Music intensity layers follow the action (`music.setIntensity`).

## Flow
- Menu → playing in one keypress. Game over → retry in one keypress, under a second.
- Persisted best score; "NEW BEST!" moment.
- Pause on Esc and on tab blur. Mute on M (persisted).
