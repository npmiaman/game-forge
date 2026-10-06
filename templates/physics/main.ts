import { bootPhaser } from '@kit/phaser/boot';
import { menuScene, gameOverScene } from '@kit/phaser/menus';
import { SONGS } from '@kit/audio';
import { Play, makeArt } from './Play';
import { TITLE, SLUG, W, H } from './config';

const Menu = menuScene({ title: TITLE, tagline: '{{TAGLINE}}', controls: 'DRAG back from the orb · RELEASE to launch · knock out every target', bestKey: SLUG, music: SONGS.chiptune, setup: makeArt, color: '#ffb84d' });
const GameOver = gameOverScene({ bestKey: SLUG });

bootPhaser({ scenes: [Menu, Play, GameOver], width: W, height: H, physics: 'matter', gravity: 1 });
