import Phaser from 'phaser';
import { text, button, clock } from '@kit/phaser/ui';
import { store } from '@kit/save';
import { sfx, music } from '@kit/audio';
import { sound } from '@kit/assets';
import { W, H } from '../config';
import { UPGRADES } from '../data';
import type { RunState } from './Play';

export const save = store('neon-swarm', { best: 0, bestWave: 0, bestTime: 0, runs: 0 });

export class GameOver extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(R: RunState) {
    save.set('runs', save.get('runs') + 1);
    const newBest = save.best('best', R.score);
    save.best('bestWave', R.wave);
    save.best('bestTime', Math.floor(R.time));

    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0);
    this.tweens.add({ targets: dim, fillAlpha: 0.75, duration: 700 });

    const title = text(this, W / 2, 120, 'SHIP DESTROYED', { size: 52, color: '#ff3366', shadow: true }).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, y: 110, duration: 500, delay: 200 });

    const score = text(this, W / 2, 205, '0', { size: 64 }).setAlpha(0);
    this.tweens.add({ targets: score, alpha: 1, duration: 300, delay: 500 });
    this.tweens.addCounter({ from: 0, to: R.score, duration: 900, delay: 600, ease: 'Cubic.Out',
      onUpdate: (tw) => score.setText(Math.round(tw.getValue() ?? 0).toLocaleString()),
      onComplete: () => {
        if (newBest && R.score > 0) {
          const nb = text(this, W / 2, 255, 'NEW BEST!', { size: 22, color: '#ffe14d', shadow: true }).setScale(0);
          this.tweens.add({ targets: nb, scale: 1, duration: 400, ease: 'Back.Out' });
          sfx.notes('select', [0, 4, 7, 12], 0.09); void sound.play('voiceover-pack/new_highscore', { minGap: 0 });
        }
      } });
    if (!newBest) text(this, W / 2, 255, `BEST ${save.get('best').toLocaleString()}`, { size: 14, color: '#8899cc' });

    const rows = [
      ['WAVE', String(R.wave)], ['TIME', clock(R.time)], ['KILLS', String(R.kills)],
      ['LEVEL', String(R.level)], ['BEST COMBO', String(R.bestCombo)],
    ];
    rows.forEach(([k, v], i) => {
      const x = W / 2 + (i - 2) * 170;
      const a = text(this, x, 320, k, { size: 11, color: '#8899cc' }).setAlpha(0);
      const b = text(this, x, 348, v, { size: 26 }).setAlpha(0);
      this.tweens.add({ targets: [a, b], alpha: 1, duration: 250, delay: 900 + i * 90 });
    });

    const ids = Object.keys(R.upgrades);
    ids.forEach((id, i) => {
      const u = UPGRADES.find((x) => x.id === id)!;
      const x = W / 2 + (i - (ids.length - 1) / 2) * 58;
      const ic = this.add.image(x, 430, u.icon).setTint(u.color).setBlendMode('ADD').setScale(0.75).setAlpha(0);
      text(this, x + 16, 448, String(R.upgrades[id]), { size: 11, color: '#ffffff' });
      this.tweens.add({ targets: ic, alpha: 1, duration: 200, delay: 1300 + i * 50 });
    });

    const retry = () => { this.scene.stop(); this.scene.start('Play'); };
    const menu = () => { music.stop(); this.scene.stop('Play'); this.scene.start('Menu'); };
    button(this, W / 2 - 120, 540, 'RETRY  [R]', retry, { size: 22 });
    button(this, W / 2 + 120, 540, 'MENU  [ESC]', menu, { size: 22 });
    this.time.delayedCall(400, () => {
      this.input.keyboard!.once('keydown-R', retry);
      this.input.keyboard!.once('keydown-SPACE', retry);
      this.input.keyboard!.once('keydown-ENTER', retry);
      this.input.keyboard!.once('keydown-ESC', menu);
    });
  }
}
