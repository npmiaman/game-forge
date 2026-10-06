/**
 * Procedural textures — make good-looking games with zero art files.
 *
 * Everything is drawn WHITE so you can colour it with sprite.setTint(0xff00aa).
 *
 *   neon(scene, 'enemy', 'triangle', 32)                 // glowing outline shape
 *   neon(scene, 'ship', 'ship', 40, { fill: 0.3 })
 *   dot(scene, 'spark', 8)                               // soft glow dot (particles, bullets)
 *   pixelArt(scene, 'hero', ['..XX..', '.XXXX.', 'X.XX.X'], { X: 0x44ccff }, 4)
 *   grid(scene, 'bg-grid', 64, 0x223355)
 */
import Phaser from 'phaser';

export type Shape =
  | 'circle' | 'ring' | 'triangle' | 'square' | 'diamond' | 'hex' | 'octagon' | 'star'
  | 'ship' | 'heart' | 'cross' | 'arrow' | 'capsule' | 'gem' | number[];

export interface NeonOpts {
  /** glow blur radius in px */ glow?: number;
  /** outline width in px */ line?: number;
  /** interior fill alpha 0..1 */ fill?: number;
  /** extra rotation of the shape in radians */ rotation?: number;
  /** draw an inner core for bullets/orbs */ core?: boolean;
}

const SHAPES: Record<string, number[]> = {
  triangle: poly(3, -Math.PI / 2 + Math.PI / 2),
  square: poly(4, Math.PI / 4),
  diamond: poly(4, 0),
  hex: poly(6, 0),
  octagon: poly(8, Math.PI / 8),
  star: star(5, 1, 0.45),
  // pointing right (angle 0), so rotation = aim angle
  ship: [1, 0, -0.75, -0.75, -0.4, 0, -0.75, 0.75],
  arrow: [1, 0, 0, -0.8, 0, -0.35, -1, -0.35, -1, 0.35, 0, 0.35, 0, 0.8],
  cross: [-0.33, -1, 0.33, -1, 0.33, -0.33, 1, -0.33, 1, 0.33, 0.33, 0.33, 0.33, 1, -0.33, 1, -0.33, 0.33, -1, 0.33, -1, -0.33, -0.33, -0.33],
  gem: [0, -1, 0.7, -0.35, 0.45, 1, -0.45, 1, -0.7, -0.35].map((v, i) => (i % 2 ? v * 0.9 : v)),
};

function poly(n: number, rot: number) {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a)); }
  return pts;
}
function star(n: number, outer: number, inner: number) {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? inner : outer;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h))!;
  draw(tex.getContext());
  tex.refresh();
  return tex;
}

/** Glowing outline shape, `size` = diameter of the shape itself (glow adds padding). */
export function neon(scene: Phaser.Scene, key: string, shape: Shape, size: number, o: NeonOpts = {}) {
  const glow = o.glow ?? Math.max(4, size * 0.18);
  const line = o.line ?? Math.max(2, size * 0.07);
  const fill = o.fill ?? 0.18;
  const pad = glow * 2 + line;
  const S = size + pad * 2;
  const r = size / 2;
  return canvasTex(scene, key, S, S, (c) => {
    c.translate(S / 2, S / 2);
    if (o.rotation) c.rotate(o.rotation);
    c.beginPath();
    if (shape === 'circle' || shape === 'ring') c.arc(0, 0, r, 0, Math.PI * 2);
    else if (shape === 'capsule') { c.roundRect(-r, -r * 0.45, size, r * 0.9, r * 0.45); }
    else if (shape === 'heart') {
      c.moveTo(0, r * 0.9);
      c.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.2, 0, -r * 0.45);
      c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9);
    } else {
      const pts = Array.isArray(shape) ? shape : SHAPES[shape];
      for (let i = 0; i < pts.length; i += 2) c[i ? 'lineTo' : 'moveTo'](pts[i] * r, pts[i + 1] * r);
    }
    c.closePath();
    c.shadowColor = '#fff';
    c.shadowBlur = glow;
    if (shape !== 'ring' && fill > 0) { c.fillStyle = `rgba(255,255,255,${fill})`; c.fill(); }
    c.lineJoin = 'round';
    c.strokeStyle = '#fff';
    c.lineWidth = line;
    c.stroke(); c.stroke();          // double stroke = brighter glow
    if (o.core) { c.shadowBlur = glow; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, r * 0.45, 0, Math.PI * 2); c.fill(); }
  });
}

/** Soft radial glow dot. Great for particles, bullets, lights. `radius` = visible radius. */
export function dot(scene: Phaser.Scene, key: string, radius: number, hardness = 0.35) {
  const S = radius * 2;
  return canvasTex(scene, key, S, S, (c) => {
    const g = c.createRadialGradient(radius, radius, 0, radius, radius, radius);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(hardness, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  });
}

/** Elongated glowing streak pointing right — bullets, lasers, speed lines. */
export function streak(scene: Phaser.Scene, key: string, length: number, thickness: number) {
  const pad = thickness * 2;
  return canvasTex(scene, key, length + pad * 2, thickness + pad * 2, (c) => {
    c.shadowColor = '#fff'; c.shadowBlur = thickness * 1.5;
    c.fillStyle = '#fff';
    c.beginPath(); c.roundRect(pad, pad, length, thickness, thickness / 2); c.fill(); c.fill();
  });
}

/** Solid white rectangle (bars, UI panels, simple platforms). */
export function rect(scene: Phaser.Scene, key: string, w: number, h: number, radius = 0) {
  return canvasTex(scene, key, w, h, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(0, 0, w, h, radius); c.fill(); });
}

/** Tileable grid line texture for backgrounds — use with scene.add.tileSprite. */
export function grid(scene: Phaser.Scene, key: string, cell: number, color = 0x1a2a4a, alpha = 1, line = 1) {
  return canvasTex(scene, key, cell, cell, (c) => {
    c.strokeStyle = `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
    c.lineWidth = line;
    c.beginPath(); c.moveTo(0, 0.5); c.lineTo(cell, 0.5); c.moveTo(0.5, 0); c.lineTo(0.5, cell); c.stroke();
  });
}

/**
 * Pixel art from strings. Each char maps to a colour in `palette`; '.' or ' ' = transparent.
 *   pixelArt(scene, 'slime', [
 *     '..GGGG..',
 *     '.GGGGGG.',
 *     'GGWGGWGG',
 *     'GGGGGGGG',
 *   ], { G: 0x55dd55, W: 0xffffff }, 4)
 * Use pixelArt: true in the game config to keep it crisp.
 */
export function pixelArt(scene: Phaser.Scene, key: string, rows: string[], palette: Record<string, number>, scale = 4) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  return canvasTex(scene, key, w * scale, h * scale, (c) => {
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = palette[ch];
      if (col === undefined) return;
      c.fillStyle = '#' + col.toString(16).padStart(6, '0');
      c.fillRect(x * scale, y * scale, scale, scale);
    }));
  });
}

/** Pixel-art spritesheet: frames side by side, then use scene.anims.create with generateFrameNumbers. */
export function pixelSheet(scene: Phaser.Scene, key: string, frames: string[][], palette: Record<string, number>, scale = 4) {
  const h = frames[0].length, w = Math.max(...frames[0].map((r) => r.length));
  const tex = canvasTex(scene, key, w * scale * frames.length, h * scale, (c) => {
    frames.forEach((rows, f) => rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = palette[ch]; if (col === undefined) return;
      c.fillStyle = '#' + col.toString(16).padStart(6, '0');
      c.fillRect((f * w + x) * scale, y * scale, scale, scale);
    })));
  });
  frames.forEach((_, i) => tex.add(i, 0, i * w * scale, 0, w * scale, h * scale));
  return tex;
}

/** Vertical gradient background texture. */
export function gradient(scene: Phaser.Scene, key: string, w: number, h: number, top: number, bottom: number) {
  return canvasTex(scene, key, w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#' + top.toString(16).padStart(6, '0'));
    g.addColorStop(1, '#' + bottom.toString(16).padStart(6, '0'));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

/**
 * Dark-edged vignette overlay. Add as an image on top of the scene (or in a HUD scene):
 *   vignette(scene, 'vig', 1280, 720); scene.add.image(640, 360, 'vig').setScrollFactor(0)
 * Prefer this over camera.filters vignette when you use ADD-blended sprites (see CLAUDE.md gotchas).
 */
export function vignette(scene: Phaser.Scene, key: string, w: number, h: number, strength = 0.7, color = 0x000000) {
  return canvasTex(scene, key, w, h, (c) => {
    const r = Math.hypot(w, h) / 2;
    const g = c.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r);
    const rgb = `${(color >> 16) & 255},${(color >> 8) & 255},${color & 255}`;
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${strength})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

/** Free-form: draw anything with the Canvas 2D API. */
export function draw(scene: Phaser.Scene, key: string, w: number, h: number, fn: (c: CanvasRenderingContext2D) => void) {
  return canvasTex(scene, key, w, h, fn);
}
