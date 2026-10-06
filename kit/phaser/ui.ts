/**
 * UI helpers: consistent text, buttons, bars, panels.
 *   text(this, x, y, 'SCORE 0', { size: 24 })
 *   button(this, x, y, 'PLAY', () => this.scene.start('Play'))
 *   const hp = bar(this, 20, 20, 200, 14, 0xff4466); hp.set(0.5)
 */
import Phaser from 'phaser';

/** Bundled offline fonts (loaded by bootPhaser). */
export const FONTS = {
  display: 'Orbitron, system-ui, sans-serif',
  pixel: '"Press Start 2P", monospace',
  body: 'system-ui, -apple-system, Segoe UI, sans-serif',
};

export interface TextOpts { size?: number; color?: string; font?: string; align?: 'left' | 'center' | 'right'; stroke?: string; strokeWidth?: number; origin?: number | [number, number]; wrap?: number; shadow?: boolean }

export function text(scene: Phaser.Scene, x: number, y: number, str: string, o: TextOpts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: o.font ?? FONTS.display,
    fontSize: `${o.size ?? 20}px`,
    color: o.color ?? '#ffffff',
    align: o.align ?? 'center',
    stroke: o.stroke ?? '#000000',
    strokeThickness: o.strokeWidth ?? 0,
    wordWrap: o.wrap ? { width: o.wrap } : undefined,
  });
  if (o.shadow) t.setShadow(0, 0, o.color ?? '#ffffff', 12, false, true);
  const og = o.origin ?? 0.5;
  Array.isArray(og) ? t.setOrigin(og[0], og[1]) : t.setOrigin(og);
  return t;
}

/** Clickable text button with hover/press feedback. Also triggers on Enter if `hotkey` given. */
export function button(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, o: TextOpts & { pad?: number; bg?: number; hotkey?: string } = {}) {
  const size = o.size ?? 24;
  const pad = o.pad ?? 14;
  const t = text(scene, 0, 0, label, { ...o, size });
  const w = t.width + pad * 2.5, h = t.height + pad;
  const bg = scene.add.rectangle(0, 0, w, h, o.bg ?? 0x000000, 0.4).setStrokeStyle(2, 0xffffff, 0.8);
  const c = scene.add.container(x, y, [bg, t]).setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => { scene.tweens.add({ targets: c, scale: 1.08, duration: 100 }); bg.setFillStyle(0xffffff, 0.15); });
  c.on('pointerout', () => { scene.tweens.add({ targets: c, scale: 1, duration: 100 }); bg.setFillStyle(o.bg ?? 0x000000, 0.4); });
  c.on('pointerdown', () => { c.setScale(0.95); });
  c.on('pointerup', () => { c.setScale(1.08); onClick(); });
  if (o.hotkey) scene.input.keyboard?.on(`keydown-${o.hotkey}`, onClick);
  return c;
}

/** Progress / health bar. bar.set(0..1) animates smoothly with a trailing "damage" segment. */
export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, o: { bg?: number; trail?: number; border?: number } = {}) {
  const back = scene.add.rectangle(x, y, w, h, o.bg ?? 0x000000, 0.6).setOrigin(0, 0.5);
  const trail = scene.add.rectangle(x, y, w, h, o.trail ?? 0xffffff, 0.8).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(x, y, w, h, color).setOrigin(0, 0.5);
  const border = scene.add.rectangle(x, y, w, h).setOrigin(0, 0.5).setStrokeStyle(2, o.border ?? 0xffffff, 0.7);
  let v = 1;
  const api = {
    objects: [back, trail, fill, border],
    get value() { return v; },
    set(nv: number, instant = false) {
      nv = Phaser.Math.Clamp(nv, 0, 1);
      fill.width = w * nv;
      if (instant || nv > v) trail.width = w * nv;
      else scene.tweens.add({ targets: trail, width: w * nv, duration: 400, delay: 150, ease: 'Quad.Out' });
      v = nv;
      return api;
    },
    setColor(c: number) { fill.setFillStyle(c); return api; },
    setVisible(b: boolean) { api.objects.forEach((o) => o.setVisible(b)); return api; },
    setScrollFactor(f: number) { api.objects.forEach((o) => o.setScrollFactor(f)); return api; },
    setDepth(d: number) { api.objects.forEach((o) => o.setDepth(d)); return api; },
    destroy() { api.objects.forEach((o) => o.destroy()); },
  };
  return api;
}

/** Dim full-screen overlay + centered panel. Returns the container to add things to. */
export function panel(scene: Phaser.Scene, w: number, h: number, o: { dim?: number; color?: number; border?: number } = {}) {
  const { width, height } = scene.scale;
  const dim = scene.add.rectangle(0, 0, width, height, 0x000000, o.dim ?? 0.6).setOrigin(0).setInteractive();
  const box = scene.add.rectangle(width / 2, height / 2, w, h, o.color ?? 0x0b0f1e, 0.92).setStrokeStyle(2, o.border ?? 0x66ccff, 0.9);
  return scene.add.container(0, 0, [dim, box]);
}

/** Format seconds as m:ss */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
