/**
 * "Pick one" card overlay — level-up upgrades, shops, perks, level select, dialogue choices.
 * Pauses the calling scene, shows cards, resumes it, resolves with the chosen index.
 *
 *   const i = await chooseCard(this, {
 *     title: 'LEVEL 3',
 *     cards: ups.offer(3).map((u) => ({ name: u.name, desc: u.desc, color: 0x33f0ff, tag: `LV ${ups.level(u.id) + 1}` })),
 *   });
 * Keys 1/2/3…, arrows + Enter, mouse, or gamepad. Registered automatically by bootPhaser.
 */
import Phaser from 'phaser';
import { text, FONTS } from './ui';
import { sfx } from '../audio';

export interface Card { name: string; desc: string; color?: number; icon?: string; tag?: string }
export interface ChooseOpts { title?: string; subtitle?: string; cards: Card[]; font?: string }

export function chooseCard(scene: Phaser.Scene, o: ChooseOpts): Promise<number> {
  return new Promise((resolve) => {
    scene.scene.pause();
    scene.scene.launch('kit-cards', { ...o, onPick: (i: number) => { scene.scene.resume(); resolve(i); } });
    scene.scene.bringToTop('kit-cards');
  });
}

export class CardScene extends Phaser.Scene {
  constructor() { super('kit-cards'); }
  create(d: ChooseOpts & { onPick: (i: number) => void }) {
    const { width: W, height: H } = this.scale;
    const font = d.font ?? FONTS.display;
    let sel = Math.floor(d.cards.length / 2), done = false, armed = false;
    this.time.delayedCall(300, () => (armed = true));
    const dim = this.add.rectangle(0, 0, W, H, 0x02030a, 0).setOrigin(0);
    this.tweens.add({ targets: dim, fillAlpha: 0.75, duration: 180 });
    if (d.title) { const t = text(this, W / 2, H * 0.15, d.title, { size: 48, color: '#5dffa0', font, shadow: true }).setScale(0.5); this.tweens.add({ targets: t, scale: 1, duration: 280, ease: 'Back.Out' }); }
    text(this, W / 2, H * 0.15 + 48, d.subtitle ?? `CHOOSE ONE  ·  1-${d.cards.length} OR CLICK`, { size: 12, color: '#8899cc', font });

    const n = d.cards.length, gap = 30;
    const cw = Math.min(290, (W - 60 - gap * (n - 1)) / n), ch = Math.min(340, H * 0.55);
    const cards = d.cards.map((c, i) => {
      const col = c.color ?? 0x33f0ff, hex = '#' + col.toString(16).padStart(6, '0');
      const kids: Phaser.GameObjects.GameObject[] = [
        this.add.rectangle(0, 0, cw, ch, 0x0b0f1e, 0.96).setStrokeStyle(2, col, 0.6),
        this.add.rectangle(0, -ch / 2 + 3, cw - 4, 6, col),
      ];
      if (c.icon && this.textures.exists(c.icon)) kids.push(this.add.image(0, -ch * 0.22, c.icon).setTint(col).setBlendMode('ADD'));
      kids.push(text(this, 0, c.icon ? 0 : -ch * 0.15, c.name.toUpperCase(), { size: 19, color: hex, font, wrap: cw - 24 }));
      if (c.tag) kids.push(text(this, 0, (c.icon ? 0 : -ch * 0.15) + 30, c.tag, { size: 12, color: hex, font }));
      kids.push(text(this, 0, ch * 0.18, c.desc, { size: 15, color: '#dde3ff', font: FONTS.body, wrap: cw - 36 }));
      kids.push(text(this, 0, ch / 2 - 22, `[ ${i + 1} ]`, { size: 12, color: '#667', font }));
      const box = this.add.container(W / 2 + (i - (n - 1) / 2) * (cw + gap), H * 0.58 + 50, kids).setSize(cw, ch).setAlpha(0).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: box, y: H * 0.58, alpha: 1, duration: 260, delay: 60 + i * 70, ease: 'Back.Out' });
      box.on('pointerover', () => highlight(i));
      box.on('pointerup', () => pick(i));
      return { box, col };
    });
    const highlight = (i: number) => {
      sel = i;
      cards.forEach(({ box, col }, j) => { box.setScale(j === i ? 1.05 : 1); (box.list[0] as Phaser.GameObjects.Rectangle).setStrokeStyle(j === i ? 4 : 2, col, j === i ? 1 : 0.6); });
    };
    const pick = (i: number) => {
      if (done || !armed) return;
      done = true;
      sfx.play('select');
      cards.forEach(({ box }, j) => this.tweens.add(j === i ? { targets: box, scale: 1.15, duration: 120, yoyo: true } : { targets: box, alpha: 0, duration: 160 }));
      this.time.delayedCall(240, () => { this.scene.stop(); d.onPick(i); });
    };
    highlight(sel);
    const kb = this.input.keyboard!;
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].slice(0, n).forEach((k, i) => kb.on(`keydown-${k}`, () => pick(i)));
    kb.on('keydown-LEFT', () => highlight(Math.max(0, sel - 1)));
    kb.on('keydown-RIGHT', () => highlight(Math.min(n - 1, sel + 1)));
    kb.on('keydown-ENTER', () => pick(sel));
    this.input.gamepad?.on('down', (_p: unknown, b: Phaser.Input.Gamepad.Button) => {
      if (b.index === 14) highlight(Math.max(0, sel - 1)); else if (b.index === 15) highlight(Math.min(n - 1, sel + 1)); else if (b.index === 0) pick(sel);
    });
  }
}
