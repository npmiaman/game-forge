/** Every tuning number. Open with ?tune for live sliders. */
import { tune } from '@kit/tune';

export const SLUG = 'hollow-house';
export const CELL = 2;          // metres per map cell
export const WALL_H = 3;

export const PLAYER = {
  walk: 3.0, sprint: 5.4, crouch: 1.6, eye: 1.6, crouchEye: 1.0, radius: 0.3,
  maxHp: 100, maxStamina: 100, sprintCost: 22, staminaRegen: 18,
  swingCost: 12, swingCooldown: 0.55, damage: 12, reach: 2.4,
  battery: 100, batteryDrain: 0.7, mouseSens: 0.0022,
};
export const NOISE = { walkStep: 3, sprintStep: 10, crouchStep: 0, swing: 6, hit: 10, door: 7, zombieBang: 9 };

export const GRANNY = {
  patrol: 1.6, investigate: 2.4, chase: 3.25, speedPerDay: 0.12,
  sight: 13, sightDark: 7, flashlightBonus: 6, fov: 75, closeSense: 2.2,
  catchRange: 1.0, stun: 3, stunPerk: 6, searchTime: 4, loseSightTime: 3,
};
export const ZOMBIE = {
  hp: 24, hpPerDay: 6, wander: 0.9, chase: 2.0, sight: 10, damage: 9, attackEvery: 1.4, windup: 0.45, reach: 1.3,
  start: 4, max: 6, respawnEvery: 35, xp: 25,
};
export const RPG = { days: 5, xpBase: 50, xpGrowth: 1.6, medkit: 40, batteryPickup: 50 };

tune(PLAYER, 'Player');
tune(GRANNY, 'Grandma');
tune(ZOMBIE, 'Zombies');
tune(NOISE, 'Noise radius');
