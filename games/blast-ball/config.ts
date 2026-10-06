/** Every tuning number. Open with ?tune for live sliders. */
import { tune } from '@kit/tune';

export const SLUG = 'blast-ball';

export const PITCH = { length: 72, width: 46, goalWidth: 8.5, goalHeight: 2.8, goalDepth: 2.5, wall: 1.6 };

export const MATCH = { seconds: 180, kickoffDelay: 2.5, respawn: 4, airdropEvery: 30, lootEvery: 14, maxLoot: 5 };

export const ZONE = { startHalfWidth: 23, endHalfWidth: 11, shrinkStart: 0.22, damage: 8 };   // shrinkStart = fraction of the match

export const MOVE = { run: 7, sprint: 10.5, accel: 40, staminaMax: 100, sprintCost: 28, staminaRegen: 22, radius: 0.5 };

export const BALL = { radius: 0.35, gravity: 22, bounce: 0.55, friction: 1.4, airDrag: 0.15, dribbleDist: 0.95, controlRange: 1.25, kickMin: 12, kickMax: 34, chargeTime: 0.7, lift: 0.35 };

export const HEALTH = { max: 150, armorMax: 50, medkit: 50, armorPickup: 50 };

export const AI = { reaction: 0.25, aim: 0.22, fireRateMul: 0.6, damageMul: 0.55, keeperReach: 1.4, shootRange: 18, goalShotRange: 21, keeperRange: 7, difficulty: 1 };

export const GLOO = { hp: 120, life: 9, width: 3.2, height: 2.4, carry: 2, max: 6 };

tune(MOVE, 'Movement');
tune(BALL, 'Ball');
tune(AI, 'AI');
tune(ZONE, 'Zone');
tune(MATCH, 'Match');
