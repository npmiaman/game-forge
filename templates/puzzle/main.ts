import { bootPhaser } from '@kit/phaser/boot';
import { menuScene, gameOverScene } from '@kit/phaser/menus';
import { SONGS } from '@kit/audio';
import { Play, makeArt } from './Play';
import { TITLE, SLUG, W, H } from './config';

const Menu = menuScene({ title: TITLE, tagline: '{{TAGLINE}}', controls: 'ARROWS / WASD move  ·  Z undo  ·  R restart', music: SONGS.ambient, setup: makeArt, color: '#5dffa0', bestKey: SLUG, formatBest: (n) => `LEVELS CLEARED ${n}` });
const GameOver = gameOverScene({ bestKey: SLUG });

bootPhaser({ scenes: [Menu, Play, GameOver], width: W, height: H, physics: false });
