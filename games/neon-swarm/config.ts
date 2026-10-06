/** All tuning lives here. Tweak numbers, reload, feel the difference. */
export const W = 1280;
export const H = 720;
export const ARENA = 2600;

export const C = {
  player: 0x33f0ff,
  bullet: 0xaefcff,
  crit: 0xffe14d,
  xp: 0x5dffa0,
  heart: 0xff3366,
  enemyBullet: 0xff4d4d,
  grid: 0x1b2550,
  border: 0x7a5cff,
  orbital: 0x9effe8,
  nova: 0x7ad7ff,
  vacuum: 0xb48cff,
};

export const BASE_STATS = {
  maxHp: 5,
  moveSpeed: 330,
  fireRate: 5.5,        // shots per second
  damage: 1,
  bulletSpeed: 820,
  bulletLife: 0.75,     // seconds
  bulletSize: 1,
  projectiles: 1,
  spread: 9,            // degrees between parallel shots
  pierce: 0,
  crit: 0.05,
  critMult: 2.5,
  magnet: 110,
  dashCd: 1.1,
  dashDamage: 0,
  orbitals: 0,
  ricochet: 0,
  volatile: 0,
  regen: 0,
  rear: 0,
  nova: 0,
};
export type Stats = typeof BASE_STATS;

export const PLAYER = {
  radius: 13,
  accel: 14,             // higher = snappier
  dashSpeed: 1150,
  dashTime: 0.16,
  iframes: 1.3,
};

export const DIRECTOR = {
  waveLength: 26,       // seconds per wave
  baseBudget: 2.4,      // spawn points per second at wave 1
  budgetPerWave: 0.8,
  maxAlive: 280,
  bossEvery: 5,
  hpScalePerWave: 0.14,
};

/** XP needed to go from level n to n+1 */
export const xpForLevel = (n: number) => Math.floor(5 + n * 3 + n * n * 0.8);
