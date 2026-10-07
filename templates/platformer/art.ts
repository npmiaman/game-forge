import Phaser from 'phaser';
import { gradient, dot } from '@kit/phaser/textures';
import { assetUrl } from '@kit/assets';
import { PALETTE as P, W, H } from './config';

/**
 * Art comes from the asset library: Kenney "Pixel Platformer" (assets/sprites/pixel-platformer).
 * Tiles are 18px, characters 24px; everything is drawn at SCALE (2×) so pixels stay crisp.
 * Browse /assets.html → sprites → "tilemap" to pick other frames (index = row × 20 + column).
 */
export const SCALE = 2;
export const FRAME = { grassTop: 2, dirt: 122, coin: 151, coinSide: 152, spikes: 68, flag: 111, flagWave: 112, heart: 44, key: 27 };
export const CHAR = { heroIdle: 0, heroStep: 1, enemyA: 18, enemyB: 19 };

export function preloadArt(scene: Phaser.Scene) {
  scene.load.spritesheet('tiles', assetUrl('sprites/pixel-platformer/Tilemap/tilemap_packed.png'), { frameWidth: 18, frameHeight: 18 });
  scene.load.spritesheet('chars', assetUrl('sprites/pixel-platformer/Tilemap/tilemap-characters_packed.png'), { frameWidth: 24, frameHeight: 24 });
}

export function makeArt(scene: Phaser.Scene) {
  if (scene.anims.exists('hero-run')) return;
  scene.anims.create({ key: 'hero-run', frames: scene.anims.generateFrameNumbers('chars', { frames: [CHAR.heroIdle, CHAR.heroStep] }), frameRate: 9, repeat: -1 });
  scene.anims.create({ key: 'slime-move', frames: scene.anims.generateFrameNumbers('chars', { frames: [CHAR.enemyA, CHAR.enemyB] }), frameRate: 4, repeat: -1 });
  scene.anims.create({ key: 'coin-spin', frames: scene.anims.generateFrameNumbers('tiles', { frames: [FRAME.coin, FRAME.coinSide] }), frameRate: 5, repeat: -1 });
  scene.anims.create({ key: 'flag-wave', frames: scene.anims.generateFrameNumbers('tiles', { frames: [FRAME.flag, FRAME.flagWave] }), frameRate: 4, repeat: -1 });
  dot(scene, 'puff', 6, 0.6);
  gradient(scene, 'sky', W, H, P.sky, P.skyBottom);
}
