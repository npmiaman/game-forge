import Phaser from 'phaser';
import { pixelArt, pixelSheet, gradient, dot } from '@kit/phaser/textures';
import { PALETTE as P, W, H } from './config';

/** All sprites are drawn from strings — edit the grids to restyle the game. Scale 4 → 8px grid = 32px sprite. */
export function makeArt(scene: Phaser.Scene) {
  if (scene.textures.exists('hero')) return;
  const pal = { K: 0x1a1030, B: P.player, b: 0x2a8fb0, W: 0xffffff, Y: P.coin, y: 0xc79a1a, R: P.spike, G: P.enemy, g: 0x2f9a3a, T: P.groundTop, D: P.ground, d: 0x3d2556 };

  // hero: idle, run1, run2, jump
  pixelSheet(scene, 'hero', [
    ['..BBBB..', '.BBBBBB.', '.BWKBWK.', '.BBBBBB.', '..bBBb..', '.BBBBBB.', '..B..B..', '.bb..bb.'],
    ['..BBBB..', '.BBBBBB.', '.BWKBWK.', '.BBBBBB.', '..bBBb..', '.BBBBBB.', '.B...B..', 'bb....b.'],
    ['..BBBB..', '.BBBBBB.', '.BWKBWK.', '.BBBBBB.', '..bBBb..', '.BBBBBB.', '..B.B...', '..bbb...'],
    ['..BBBB..', '.BBBBBB.', '.BWKBWK.', '.BBBBBB.', 'B.bBBb.B', '.BBBBBB.', '.B....B.', '........'],
  ], pal, 4);
  scene.anims.create({ key: 'hero-run', frames: scene.anims.generateFrameNumbers('hero', { frames: [1, 0, 2, 0] }), frameRate: 12, repeat: -1 });

  pixelSheet(scene, 'slime', [
    ['........', '........', '..GGGG..', '.GGGGGG.', 'GGWKGWKG', 'GGGGGGGG', 'GgGGGGgG', '.gggggg.'],
    ['........', '..GGGG..', '.GGGGGG.', 'GGWKGWKG', 'GGGGGGGG', 'GGGGGGGG', 'gGGGGGGg', 'gggggggg'],
  ], pal, 4);
  scene.anims.create({ key: 'slime-move', frames: scene.anims.generateFrameNumbers('slime', { frames: [0, 1] }), frameRate: 4, repeat: -1 });

  pixelSheet(scene, 'coin', [
    ['..YYYY..', '.YyyyyY.', 'YyYYYYyY', 'YyYWYYyY', 'YyYWYYyY', 'YyYYYYyY', '.YyyyyY.', '..YYYY..'],
    ['...YY...', '..YyyY..', '..YyYY..', '..YWYY..', '..YWYY..', '..YyYY..', '..YyyY..', '...YY...'],
  ], pal, 4);
  scene.anims.create({ key: 'coin-spin', frames: scene.anims.generateFrameNumbers('coin', { frames: [0, 1] }), frameRate: 5, repeat: -1 });

  pixelArt(scene, 'ground-top', ['TTTTTTTT', 'TTTTTTTT', 'DTDDDTDD', 'DDDDDDDD', 'DDdDDDDD', 'DDDDDdDD', 'DDDDDDDD', 'dDDDDDDd'], pal, 4);
  pixelArt(scene, 'ground', ['DDDDDDDD', 'DDdDDDDD', 'DDDDDDdD', 'DDDDDDDD', 'DdDDDDDD', 'DDDDDdDD', 'DDDDDDDD', 'dDDDDDDd'], pal, 4);
  pixelArt(scene, 'spike', ['........', '........', '...R....', '...R..R.', '..RR..R.', '..RR.RR.', '.RRRRRRR', 'RRRRRRRR'], pal, 4);
  pixelArt(scene, 'flag', ['WRRRRR..', 'WRRRRRR.', 'WRRRRR..', 'W.......', 'W.......', 'W.......', 'W.......', 'W.......'], { W: 0xffffff, R: 0x66ff99 }, 4);
  dot(scene, 'puff', 6, 0.6);
  gradient(scene, 'sky', W, H, P.sky, P.skyBottom);
}
