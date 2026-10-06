/**
 * One-call Phaser setup with sane defaults (scale-to-fit, fonts loaded, playtest hook).
 *
 *   bootPhaser({ scenes: [Boot, Menu, Play], width: 1280, height: 720 });
 */
import Phaser from 'phaser';
import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/press-start-2p/400.css';
import { PauseScene } from './scenes';
import { CardScene } from './cards';

export interface BootOpts {
  scenes: Phaser.Types.Scenes.SceneType[];
  width?: number;
  height?: number;
  background?: string;
  /** crisp pixels for pixel-art games */
  pixelArt?: boolean;
  /** 'arcade' (default, fast AABB/circles), 'matter' (real rigid bodies, joints), or false */
  physics?: 'arcade' | 'matter' | false;
  gravity?: number;
  debug?: boolean;
  /** Phaser.Scale mode — FIT keeps aspect ratio (default), RESIZE fills the window */
  scaleMode?: Phaser.Scale.ScaleModes;
  parent?: string;
}

export async function bootPhaser(o: BootOpts) {
  // Text renders with a fallback font if it isn't loaded yet, so wait for it.
  await Promise.all(['400 16px Orbitron', '700 16px Orbitron', '900 16px Orbitron', '16px "Press Start 2P"'].map((f) => document.fonts.load(f))).catch(() => {});
  const debug = o.debug ?? new URLSearchParams(location.search).has('debug');
  const physics: Phaser.Types.Core.PhysicsConfig | undefined =
    o.physics === false ? undefined
    : o.physics === 'matter' ? { default: 'matter', matter: { gravity: { x: 0, y: o.gravity ?? 1 }, debug } }
    : { default: 'arcade', arcade: { gravity: { x: 0, y: o.gravity ?? 0 }, debug } };

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: o.parent ?? 'game',
    width: o.width ?? 1280,
    height: o.height ?? 720,
    backgroundColor: o.background ?? '#05060f',
    pixelArt: o.pixelArt ?? false,
    antialias: !o.pixelArt,
    physics,
    input: { gamepad: true, activePointers: 3 },
    scale: { mode: o.scaleMode ?? Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    disableContextMenu: true,
    scene: [...o.scenes, PauseScene, CardScene],
  });
  // Exposed for scripts/shot.mjs and console debugging.
  (window as any).__game = game;
  return game;
}

/** Publish game state for automated playtests: playtest({ score, wave, alive }) each frame or on change. */
export function playtest(state: Record<string, unknown>) {
  (window as any).__playtest = { ...(window as any).__playtest, ...state };
}
