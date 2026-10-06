/**
 * Ready-made Menu and GameOver scenes, so a game is mostly its Play scene.
 *
 *   const Menu = menuScene({ title: 'SPACE GOLF', tagline: 'one shot per hole', controls: 'drag to aim · release to shoot', bestKey: 'space-golf' });
 *   const GameOver = gameOverScene({ bestKey: 'space-golf' });
 *   bootPhaser({ scenes: [Menu, Play, GameOver] });
 *
 *   // from Play:
 *   this.scene.start('GameOver', { score: 1200, stats: [['WAVE', '7'], ['KILLS', '231']] });
 *   this.scene.start('GameOver', { title: 'YOU WIN', won: true, score: 3, lowerIsBetter: true });
 *
 * `background(scene)` lets a game draw its own animated backdrop behind both screens.
 */
import Phaser from 'phaser';
import { text, button, FONTS } from './ui';
import { go } from './scenes';
import { sfx, music, audio, type Song } from '../audio';
import { store } from '../save';

export interface MenuOpts {
  key?: string; playKey?: string;
  title: string; tagline?: string; controls?: string;
  color?: string; font?: string; music?: Song;
  bestKey?: string; formatBest?: (best: number) => string;
  background?: (scene: Phaser.Scene) => void;
  /** called once in create (generate textures here so every scene has them) */
  setup?: (scene: Phaser.Scene) => void;
}

const best = (key: string) => store(key, { best: 0, runs: 0 });

export function menuScene(o: MenuOpts) {
  return class Menu extends Phaser.Scene {
    constructor() { super(o.key ?? 'Menu'); }
    create() {
      o.setup?.(this);
      const { width: W, height: H } = this.scale;
      const font = o.font ?? FONTS.display, color = o.color ?? '#33f0ff';
      o.background?.(this);
      const pixel = font === FONTS.pixel;
      const title = text(this, W / 2, H * 0.28, o.title, { size: pixel ? Math.min(44, W / o.title.length) : Math.min(88, (W * 1.3) / o.title.length), color, font, shadow: !pixel, stroke: pixel ? '#000' : undefined, strokeWidth: pixel ? 8 : 0 });
      this.tweens.add({ targets: title, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      if (o.tagline) text(this, W / 2, H * 0.28 + (pixel ? 50 : 70), o.tagline.toUpperCase(), { size: pixel ? 10 : 16, color: '#b9a8ff', font });

      const start = () => {
        sfx.play('select');
        if (o.music && !music.playing) music.play(o.music);
        go(this, o.playKey ?? 'Play');
      };
      const b = button(this, W / 2, H * 0.62, pixel ? 'START' : 'PLAY', start, { size: pixel ? 18 : 30, font });
      this.tweens.add({ targets: b, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
      if (o.controls) text(this, W / 2, H * 0.78, o.controls, { size: pixel ? 9 : 14, color: '#aab4ff', font, wrap: W - 80 });
      if (o.bestKey) {
        const s = best(o.bestKey);
        if (s.get('best')) text(this, W / 2, H * 0.88, o.formatBest ? o.formatBest(s.get('best')) : `BEST ${s.get('best').toLocaleString()}`, { size: pixel ? 9 : 13, color: '#ffe14d', font });
      }
      const back = text(this, 16, 14, '← ARCADE', { size: pixel ? 8 : 12, color: '#667', font, origin: [0, 0] }).setInteractive({ useHandCursor: true });
      back.on('pointerup', () => (location.href = '../../'));
      const mute = text(this, W - 16, 14, '', { size: pixel ? 8 : 12, color: '#667', font, origin: [1, 0] }).setInteractive({ useHandCursor: true });
      const upd = () => mute.setText(audio.muted ? 'SOUND OFF' : 'SOUND ON');
      upd(); mute.on('pointerup', () => { audio.toggleMute(); upd(); });

      const kb = this.input.keyboard!;
      kb.once('keydown-SPACE', start);
      kb.once('keydown-ENTER', start);
      kb.on('keydown-M', () => { audio.toggleMute(); upd(); });
      this.input.gamepad?.once('down', start);
    }
  };
}

export interface GameOverData {
  title?: string; won?: boolean; score?: number; lowerIsBetter?: boolean;
  stats?: [string, string][];
  /** override which scene RETRY starts and with what data (e.g. same level) */
  retryKey?: string; retryData?: object;
  scoreLabel?: (n: number) => string;
}
export interface GameOverOpts { key?: string; playKey?: string; menuKey?: string; bestKey?: string; font?: string; background?: (scene: Phaser.Scene) => void }

export function gameOverScene(o: GameOverOpts = {}) {
  return class GameOver extends Phaser.Scene {
    constructor() { super(o.key ?? 'GameOver'); }
    create(d: GameOverData) {
      const { width: W, height: H } = this.scale;
      const font = o.font ?? FONTS.display, pixel = font === FONTS.pixel;
      o.background?.(this);
      this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0);
      const title = text(this, W / 2, H * 0.2, d.title ?? (d.won ? 'YOU WIN!' : 'GAME OVER'), { size: pixel ? 30 : 56, font, color: d.won ? '#7dff6b' : '#ff3366', shadow: !pixel, stroke: pixel ? '#000' : undefined, strokeWidth: pixel ? 8 : 0 }).setScale(0);
      this.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.Out' });

      let newBest = false;
      if (o.bestKey && d.score !== undefined) {
        const s = best(o.bestKey);
        s.set('runs', s.get('runs') + 1);
        const prev = s.get('best');
        newBest = d.lowerIsBetter ? (d.won !== false && (!prev || d.score < prev)) : d.score > prev;
        if (newBest) s.set('best', d.score);
      }
      if (d.score !== undefined) {
        const label = d.scoreLabel ?? ((n: number) => Math.round(n).toLocaleString());
        const sc = text(this, W / 2, H * 0.36, label(0), { size: pixel ? 24 : 60, font });
        this.tweens.addCounter({ from: 0, to: d.score, duration: 800, delay: 300, ease: 'Cubic.Out', onUpdate: (t) => sc.setText(label(t.getValue() ?? 0)) });
        if (newBest) this.time.delayedCall(1150, () => {
          const nb = text(this, W / 2, H * 0.36 + (pixel ? 34 : 50), 'NEW BEST!', { size: pixel ? 12 : 22, color: '#ffe14d', font, shadow: !pixel }).setScale(0);
          this.tweens.add({ targets: nb, scale: 1, duration: 350, ease: 'Back.Out' });
          sfx.notes('select', [0, 4, 7, 12], 0.08);
        });
      }
      (d.stats ?? []).forEach(([k, v], i, a) => {
        const x = W / 2 + (i - (a.length - 1) / 2) * Math.min(170, (W - 80) / a.length);
        text(this, x, H * 0.55, k, { size: pixel ? 8 : 11, color: '#8899cc', font });
        text(this, x, H * 0.55 + (pixel ? 22 : 28), v, { size: pixel ? 14 : 24, font });
      });
      const retry = () => this.scene.start(d.retryKey ?? o.playKey ?? 'Play', d.retryData);
      const menu = () => { music.stop(); this.scene.start(o.menuKey ?? 'Menu'); };
      button(this, W / 2 - 120, H * 0.76, 'RETRY [R]', retry, { size: pixel ? 12 : 20, font });
      button(this, W / 2 + 120, H * 0.76, 'MENU [ESC]', menu, { size: pixel ? 12 : 20, font });
      this.time.delayedCall(350, () => {
        const kb = this.input.keyboard!;
        kb.once('keydown-R', retry); kb.once('keydown-SPACE', retry); kb.once('keydown-ENTER', retry); kb.once('keydown-ESC', menu);
      });
    }
  };
}
