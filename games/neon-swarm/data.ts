import type { Stats } from './config';
import { C } from './config';

// ------------------------------------------------------------------ enemies

export type Kind = 'drone' | 'dart' | 'splitter' | 'mini' | 'spitter' | 'brute' | 'boss';

export interface EnemyDef {
  tex: string; color: number; hp: number; speed: number; r: number;
  xp: number; score: number; cost: number; unlock: number;
  /** knockback multiplier (lower = heavier) */ knock: number;
  /** spin the sprite instead of facing movement */ spin?: number;
}

export const ENEMIES: Record<Kind, EnemyDef> = {
  drone:    { tex: 'e-drone', color: 0xff3df0, hp: 3,   speed: 125, r: 14, xp: 1,  score: 10,   cost: 1,   unlock: 1,  knock: 1 },
  dart:     { tex: 'e-dart',  color: 0xffe14d, hp: 3,   speed: 105, r: 13, xp: 1,  score: 15,   cost: 1.6, unlock: 2,  knock: 1 },
  splitter: { tex: 'e-split', color: 0xb26bff, hp: 9,   speed: 80,  r: 20, xp: 2,  score: 25,   cost: 3,   unlock: 3,  knock: 0.7, spin: 1.5 },
  mini:     { tex: 'e-mini',  color: 0xe0b3ff, hp: 1,   speed: 185, r: 9,  xp: 0,  score: 5,    cost: 0,   unlock: 99, knock: 1.2 },
  spitter:  { tex: 'e-spit',  color: 0x5dff7a, hp: 7,   speed: 105, r: 16, xp: 2,  score: 30,   cost: 3,   unlock: 4,  knock: 0.8, spin: 2.5 },
  brute:    { tex: 'e-brute', color: 0xff8a2a, hp: 34,  speed: 58,  r: 30, xp: 6,  score: 70,   cost: 7,   unlock: 6,  knock: 0.2, spin: 0.6 },
  boss:     { tex: 'e-boss',  color: 0xff2255, hp: 520, speed: 70,  r: 66, xp: 40, score: 1500, cost: 0,   unlock: 99, knock: 0.03, spin: 0.4 },
};

// ------------------------------------------------------------------ upgrades

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  weight: number;
  color: number;
  icon: string; // texture key
  apply: (s: Stats) => void;
}

export const UPGRADES: Upgrade[] = [
  { id: 'rate',    name: 'Overclock',      desc: '+22% fire rate',                         max: 8, weight: 10, color: 0x33f0ff, icon: 'i-rate',    apply: (s) => { s.fireRate *= 1.22; } },
  { id: 'multi',   name: 'Split Shot',     desc: '+1 projectile',                           max: 6, weight: 7,  color: 0x33f0ff, icon: 'i-multi',   apply: (s) => { s.projectiles += 1; } },
  { id: 'dmg',     name: 'High Caliber',   desc: '+35% damage, bigger bullets',            max: 8, weight: 10, color: 0xff3366, icon: 'i-dmg',     apply: (s) => { s.damage *= 1.35; s.bulletSize += 0.12; } },
  { id: 'pierce',  name: 'Railgun Core',   desc: 'Bullets pierce +1 enemy',                max: 5, weight: 6,  color: 0xaefcff, icon: 'i-pierce',  apply: (s) => { s.pierce += 1; } },
  { id: 'speed',   name: 'Velocity',       desc: '+25% bullet speed & range',              max: 4, weight: 6,  color: 0xaefcff, icon: 'i-speed',   apply: (s) => { s.bulletSpeed *= 1.25; s.bulletLife *= 1.1; } },
  { id: 'crit',    name: 'Lucky Rounds',   desc: '+10% crit chance (2.5x dmg)',            max: 5, weight: 7,  color: 0xffe14d, icon: 'i-crit',    apply: (s) => { s.crit += 0.1; } },
  { id: 'ricochet',name: 'Ricochet',       desc: 'Bullets bounce to +1 nearby enemy',      max: 4, weight: 6,  color: 0x9effe8, icon: 'i-rico',    apply: (s) => { s.ricochet += 1; } },
  { id: 'volatile',name: 'Volatile Rounds',desc: 'Kills explode. Chain reactions!',        max: 5, weight: 6,  color: 0xff8a2a, icon: 'i-boom',    apply: (s) => { s.volatile += 1; } },
  { id: 'rear',    name: 'Rear Guard',     desc: '+1 shot fired backwards',                max: 3, weight: 4,  color: 0x33f0ff, icon: 'i-rear',    apply: (s) => { s.rear += 1; } },
  { id: 'orbit',   name: 'Orbitals',       desc: '+1 blade orbiting your ship',            max: 6, weight: 7,  color: C.orbital, icon: 'i-orbit',   apply: (s) => { s.orbitals += 1; } },
  { id: 'nova',    name: 'Nova Pulse',     desc: 'Periodic shockwave. Stacks = faster',    max: 5, weight: 5,  color: C.nova,    icon: 'i-nova',    apply: (s) => { s.nova += 1; } },
  { id: 'move',    name: 'Thrusters',      desc: '+12% move speed',                        max: 5, weight: 6,  color: 0x5dffa0, icon: 'i-move',    apply: (s) => { s.moveSpeed *= 1.12; } },
  { id: 'dash',    name: 'Phase Dash',     desc: '-20% dash cooldown, dash shreds enemies',max: 4, weight: 5,  color: 0x5dffa0, icon: 'i-dash',    apply: (s) => { s.dashCd *= 0.8; s.dashDamage += 4; } },
  { id: 'hp',      name: 'Hull Plating',   desc: '+1 max HP and heal 2',                   max: 5, weight: 6,  color: C.heart,   icon: 'i-hp',      apply: (s) => { s.maxHp += 1; } },
  { id: 'regen',   name: 'Nanobots',       desc: 'Regenerate 1 HP every few waves',        max: 3, weight: 3,  color: C.heart,   icon: 'i-regen',   apply: (s) => { s.regen += 1; } },
  { id: 'magnet',  name: 'Tractor Beam',   desc: '+50% pickup radius',                     max: 4, weight: 5,  color: C.xp,      icon: 'i-magnet',  apply: (s) => { s.magnet *= 1.5; } },
];
