import { bootPhaser } from '@kit/phaser/boot';
import { menuScene, gameOverScene } from '@kit/phaser/menus';
import { FONTS } from '@kit/phaser/ui';
import { SONGS } from '@kit/audio';
import { Play } from './scenes/Play';
import { makeArt } from './art';
import { TITLE, SLUG, W, H } from './config';

const sky = (s: Phaser.Scene) => { makeArt(s); s.add.image(0, 0, 'sky').setOrigin(0); };
const Menu = menuScene({ title: TITLE, tagline: '{{TAGLINE}}', controls: 'ARROWS/WASD move   SPACE jump   ESC pause', font: FONTS.pixel, color: '#ffd23f', music: SONGS.chiptune, bestKey: SLUG, formatBest: (b) => `BEST CLEAR ${b.toFixed(1)}s`, background: sky });
const GameOver = gameOverScene({ bestKey: SLUG, font: FONTS.pixel, background: sky });

bootPhaser({ scenes: [Menu, Play, GameOver], width: W, height: H, pixelArt: true, physics: 'arcade', gravity: 1500 });
