import Phaser from 'phaser';
import { neon, dot, streak, grid, vignette } from '@kit/phaser/textures';
import { C, W, H } from './config';
import { ENEMIES, UPGRADES } from './data';

/** Generates every texture the game uses. Idempotent. */
export function makeArt(scene: Phaser.Scene) {
  if (scene.textures.exists('player')) return;
  neon(scene, 'player', 'ship', 40, { fill: 0.25, glow: 10 });
  neon(scene, 'ghost', 'ship', 40, { fill: 0.5, glow: 6 });
  streak(scene, 'bullet', 20, 6);
  dot(scene, 'ebullet', 11, 0.55);
  neon(scene, 'gem', 'gem', 13, { fill: 0.6, glow: 6, line: 2 });
  neon(scene, 'heart', 'heart', 22, { fill: 0.6, glow: 8 });
  neon(scene, 'vacuum', 'star', 26, { fill: 0.5, glow: 10 });
  neon(scene, 'orbital', 'diamond', 18, { fill: 0.7, glow: 8 });
  neon(scene, 'marker', 'ring', 36, { glow: 8, line: 3 });
  dot(scene, 'spark', 10);
  dot(scene, 'glow', 64, 0.05);
  grid(scene, 'grid', 80, C.grid, 0.9, 2);
  vignette(scene, 'vignette', W, H, 0.75);

  const shapes: Record<string, Parameters<typeof neon>[2]> = {
    'e-drone': 'triangle', 'e-dart': 'arrow', 'e-split': 'circle', 'e-mini': 'circle',
    'e-spit': 'square', 'e-brute': 'hex', 'e-boss': 'star',
  };
  for (const def of Object.values(ENEMIES)) {
    neon(scene, def.tex, shapes[def.tex], def.r * 2.2, { fill: 0.22, core: def.tex === 'e-split' || def.tex === 'e-boss', glow: Math.max(6, def.r * 0.4) });
  }

  // upgrade icons
  const icons: Record<string, Parameters<typeof neon>[2]> = {
    'i-rate': 'arrow', 'i-multi': 'triangle', 'i-dmg': 'star', 'i-pierce': 'diamond', 'i-speed': 'arrow',
    'i-crit': 'star', 'i-rico': 'diamond', 'i-boom': 'octagon', 'i-rear': 'ship', 'i-orbit': 'ring',
    'i-nova': 'ring', 'i-move': 'ship', 'i-dash': 'arrow', 'i-hp': 'heart', 'i-regen': 'cross', 'i-magnet': 'gem',
  };
  for (const u of UPGRADES) neon(scene, u.icon, icons[u.icon] ?? 'circle', 46, { fill: 0.3, glow: 10 });
}
