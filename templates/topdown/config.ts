/** Every tuning number. Open with ?tune to edit live. */
export const TITLE = '{{TITLE}}';
export const SLUG = '{{SLUG}}';
export const W = 1280;
export const H = 720;
export const ARENA = 2000;

export const BASE = { speed: 320, accel: 14, fireRate: 5, damage: 1, bulletSpeed: 800, bulletLife: 0.8, projectiles: 1, pierce: 0, magnet: 100, maxHp: 5, dashCd: 1 };
export type Stats = typeof BASE;

export const SPAWN = { waveLength: 25, baseBudget: 1.4, perWave: 0.7, maxAlive: 250 };

export const ENEMY = {
  grunt: { color: 0xff3df0, hp: 3, speed: 120, r: 14, xp: 1, score: 10 },
  runner: { color: 0xffe14d, hp: 2, speed: 210, r: 11, xp: 1, score: 15 },
  tank: { color: 0xff8a2a, hp: 25, speed: 60, r: 28, xp: 5, score: 60 },
} as const;
export type EnemyKind = keyof typeof ENEMY;

export const xpFor = (lvl: number) => 4 + lvl * 4;
