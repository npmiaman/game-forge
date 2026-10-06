/**
 * Scene flow helpers.
 *
 *   go(this, 'Play', { level: 2 })        // fade out → start scene
 *   enablePause(this)                     // in Play.create(): Esc/P pauses, auto-pause on tab blur,
 *                                         // Q in pause menu quits to 'Menu'. Uses the built-in 'kit-pause' scene.
 */
import Phaser from 'phaser';
import { text } from './ui';
import { audio } from '../audio';

export function go(scene: Phaser.Scene, key: string, data?: object, ms = 220) {
  const cam = scene.cameras.main;
  if ((cam as any).__leaving) return;
  (cam as any).__leaving = true;
  cam.fadeOut(ms, 0, 0, 0);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}

export interface PauseOpts { menuKey?: string; hint?: string }

export function enablePause(scene: Phaser.Scene, o: PauseOpts = {}) {
  const open = () => {
    if (!scene.scene.isActive() || scene.scene.isActive('kit-pause')) return;
    scene.scene.pause();
    scene.scene.launch('kit-pause', { target: scene.scene.key, ...o });
  };
  const kb = scene.input.keyboard!;
  kb.on('keydown-ESC', open);
  kb.on('keydown-P', open);
  kb.on('keydown-M', () => audio.toggleMute());
  scene.game.events.on(Phaser.Core.Events.BLUR, open);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(Phaser.Core.Events.BLUR, open));
}

/** Registered automatically by bootPhaser. */
export class PauseScene extends Phaser.Scene {
  constructor() { super('kit-pause'); }
  create(d: { target: string } & PauseOpts) {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0);
    text(this, W / 2, H / 2 - 50, 'PAUSED', { size: 52, shadow: true });
    text(this, W / 2, H / 2 + 20, 'ESC resume  ·  Q quit to menu  ·  M mute', { size: 14, color: '#aab4ff' });
    if (d.hint) text(this, W / 2, H / 2 + 54, d.hint, { size: 12, color: '#778' });
    const resume = () => { this.scene.stop(); this.scene.resume(d.target); };
    const kb = this.input.keyboard!;
    this.time.delayedCall(80, () => { kb.on('keydown-ESC', resume); kb.on('keydown-P', resume); });
    kb.on('keydown-M', () => audio.toggleMute());
    kb.on('keydown-Q', () => {
      const menu = d.menuKey ?? 'Menu';
      if (!this.scene.get(menu)) return;
      this.scene.stop(d.target); this.scene.stop(); this.scene.start(menu);
    });
    this.input.once('pointerup', resume);
  }
}
