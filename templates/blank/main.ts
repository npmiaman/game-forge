import { bootPhaser } from '@kit/phaser/boot';
import { menuScene, gameOverScene } from '@kit/phaser/menus';
import { SONGS } from '@kit/audio';
import { Play, makeArt } from './Play';
import { TITLE, SLUG, W, H } from './config';

const Menu = menuScene({ title: TITLE, tagline: '{{TAGLINE}}', controls: 'WASD / ARROWS move  ·  grab the gold  ·  dodge the red', bestKey: SLUG, music: SONGS.synthwave, setup: makeArt });
const GameOver = gameOverScene({ bestKey: SLUG });

bootPhaser({ scenes: [Menu, Play, GameOver], width: W, height: H });
