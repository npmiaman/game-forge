import { bootPhaser } from '@kit/phaser/boot';
import { Menu } from './scenes/Menu';
import { Play } from './scenes/Play';
import { Hud } from './scenes/Hud';
import { LevelUp } from './scenes/LevelUp';
import { GameOver } from './scenes/GameOver';
import { W, H } from './config';

bootPhaser({ scenes: [Menu, Play, Hud, LevelUp, GameOver], width: W, height: H, physics: false });
