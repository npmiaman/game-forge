import Phaser from 'phaser';
import { text } from '@kit/phaser/ui';
import { sfx } from '@kit/audio';
import { W, H } from '../config';
import { UPGRADES } from '../data';

interface Data { choices: string[]; level: number; owned: Record<string, number> }

export class LevelUp extends Phaser.Scene {
  constructor() { super('LevelUp'); }

  create(data: Data) {
    let chosen = false;
    let sel = 1;
    const armed = { v: false };
    this.time.delayedCall(350, () => (armed.v = true));

    const dim = this.add.rectangle(0, 0, W, H, 0x02030a, 0).setOrigin(0);
    this.tweens.add({ targets: dim, fillAlpha: 0.72, duration: 200 });
    const title = text(this, W / 2, 110, `LEVEL ${data.level}`, { size: 54, color: '#5dffa0', shadow: true }).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' });
    text(this, W / 2, 160, 'CHOOSE AN UPGRADE   ·   1 / 2 / 3 OR CLICK', { size: 13, color: '#8899cc' });

    const cards: Phaser.GameObjects.Container[] = [];
    const pick = (i: number) => {
      if (chosen || !armed.v) return;
      chosen = true;
      sfx.play('select');
      const c = cards[i];
      this.tweens.add({ targets: c, scale: 1.15, duration: 120, yoyo: true });
      cards.forEach((o, j) => j !== i && this.tweens.add({ targets: o, alpha: 0, y: o.y + 40, duration: 200 }));
      this.time.delayedCall(260, () => {
        this.scene.stop();
        this.scene.get('Play').events.emit('upgrade', data.choices[i]);
      });
    };
    const highlight = (i: number) => {
      sel = i;
      cards.forEach((c, j) => { c.setScale(j === i ? 1.06 : 1); (c.list[0] as Phaser.GameObjects.Rectangle).setStrokeStyle(j === i ? 4 : 2, (c.getData('color') as number), j === i ? 1 : 0.6); });
    };

    const cw = 300, ch = 360, gap = 40;
    data.choices.forEach((id, i) => {
      const u = UPGRADES.find((x) => x.id === id)!;
      const have = data.owned[id] ?? 0;
      const x = W / 2 + (i - (data.choices.length - 1) / 2) * (cw + gap);
      const hex = '#' + u.color.toString(16).padStart(6, '0');
      const bg = this.add.rectangle(0, 0, cw, ch, 0x0b0f1e, 0.95).setStrokeStyle(2, u.color, 0.6);
      const glow = this.add.rectangle(0, -ch / 2 + 3, cw - 4, 6, u.color, 0.9);
      const icon = this.add.image(0, -80, u.icon).setTint(u.color).setBlendMode('ADD').setScale(1.3);
      const name = text(this, 0, 0, u.name.toUpperCase(), { size: 20, color: hex });
      const pips = text(this, 0, 32, '◆'.repeat(have) + '◇'.repeat(Math.max(0, u.max - have)), { size: 14, color: hex, font: 'system-ui' });
      const desc = text(this, 0, 82, u.desc, { size: 15, color: '#dde3ff', wrap: cw - 40, font: 'system-ui, sans-serif' });
      const key = text(this, 0, ch / 2 - 26, `[ ${i + 1} ]`, { size: 13, color: '#667' });
      const isNew = have === 0 ? text(this, cw / 2 - 40, -ch / 2 + 24, 'NEW', { size: 11, color: '#ffe14d' }) : null;
      const c = this.add.container(x, H / 2 + 60, [bg, glow, icon, name, pips, desc, key, ...(isNew ? [isNew] : [])]).setSize(cw, ch).setData('color', u.color);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerover', () => highlight(i));
      c.on('pointerup', () => pick(i));
      c.setAlpha(0).setY(H / 2 + 120);
      this.tweens.add({ targets: c, alpha: 1, y: H / 2 + 60, duration: 280, delay: 80 + i * 70, ease: 'Back.Out' });
      this.tweens.add({ targets: icon, angle: 360, duration: 6000, repeat: -1 });
      cards.push(c);
    });
    highlight(1);

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => pick(0));
    kb.on('keydown-TWO', () => pick(1));
    kb.on('keydown-THREE', () => pick(2));
    kb.on('keydown-LEFT', () => highlight(Math.max(0, sel - 1)));
    kb.on('keydown-RIGHT', () => highlight(Math.min(cards.length - 1, sel + 1)));
    kb.on('keydown-A', () => highlight(Math.max(0, sel - 1)));
    kb.on('keydown-D', () => highlight(Math.min(cards.length - 1, sel + 1)));
    kb.on('keydown-ENTER', () => pick(sel));
    this.input.gamepad?.on('down', (_p: unknown, b: Phaser.Input.Gamepad.Button) => {
      if (b.index === 14) highlight(Math.max(0, sel - 1));
      else if (b.index === 15) highlight(Math.min(cards.length - 1, sel + 1));
      else if (b.index === 0) pick(sel);
    });
  }
}
