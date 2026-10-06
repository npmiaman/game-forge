/**
 * Game feel in one object. Create once per scene in create():
 *   const juice = new Juice(this);
 *   juice.shake(0.6); juice.hitstop(50); juice.flash(enemy); juice.burst(x, y, 0xff3366);
 *   juice.pop(x, y, '+100'); juice.ring(x, y, 0x66ccff); juice.slowmo(0.3, 400); juice.zoomPunch(1.06)
 * In update(): multiply your own dt by juice.timeScale (0 during hitstop) for custom movement.
 */
import Phaser from 'phaser';
import { dot } from './textures';
import { FONTS } from './ui';

export class Juice {
  /** 0 while frozen by hitstop, <1 during slowmo, else 1. Multiply custom dt by this. */
  timeScale = 1;
  private frozen = false;
  private slow = 1;
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private baseZoom: number;
  private timers: number[] = [];
  /** Global multiplier for shake strength (settings / accessibility). */
  static shakeScale = 1;

  constructor(private scene: Phaser.Scene, public depth = 50) {
    if (!scene.textures.exists('juice-dot')) dot(scene, 'juice-dot', 8);
    if (!scene.textures.exists('juice-dot-lg')) dot(scene, 'juice-dot-lg', 32, 0.1);
    this.baseZoom = scene.cameras.main.zoom;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.timers.forEach(clearTimeout); this.timers = []; });
  }

  private later(ms: number, fn: () => void) { this.timers.push(window.setTimeout(fn, ms)); }
  private apply() {
    this.timeScale = this.frozen ? 0 : this.slow;
    const s = this.scene;
    const ts = Math.max(this.timeScale, 0.0001);
    if (s.physics?.world) { if (this.frozen) s.physics.world.pause(); else { s.physics.world.resume(); s.physics.world.timeScale = 1 / ts; } }
    const mw = (s as any).matter?.world;
    if (mw?.engine) mw.engine.timing.timeScale = this.frozen ? 0 : this.slow;
    s.tweens.timeScale = this.frozen ? 0 : this.slow;
    for (const e of this.emitters.values()) e.timeScale = this.frozen ? 0 : this.slow;
  }

  /** Camera shake. strength ~0.2 (tap) .. 1 (huge). */
  shake(strength = 0.4, ms = 140) {
    const s = strength * Juice.shakeScale;
    if (s <= 0) return;
    this.scene.cameras.main.shake(ms, 0.012 * s, true);
  }

  /** Freeze the game for a few frames on impact — makes hits feel heavy. 30–90ms is typical. */
  hitstop(ms = 50) {
    if (this.frozen) return;
    this.frozen = true; this.apply();
    this.later(ms, () => { this.frozen = false; this.apply(); });
  }

  /** Slow motion. factor 0.25 = quarter speed. */
  slowmo(factor = 0.3, ms = 500) {
    this.slow = factor; this.apply();
    this.later(ms, () => { this.slow = 1; this.apply(); });
  }

  /** Flash an object solid colour (default white) briefly, then restore its normal tint. */
  flash(obj: Phaser.GameObjects.GameObject & { setTint: Function; setTintMode: Function; active: boolean }, ms = 60, color = 0xffffff) {
    const o = obj as any;
    if (!o.__flashing) o.__restoreTint = o.tint ?? 0xffffff;
    o.__flashing = true;
    obj.setTint(color).setTintMode(Phaser.TintModes.FILL);
    o.__flashTimer?.remove();
    o.__flashTimer = this.scene.time.delayedCall(ms, () => {
      o.__flashing = false;
      if (obj.active) obj.setTint(o.__restoreTint).setTintMode(Phaser.TintModes.MULTIPLY);
    });
  }

  /** Particle burst. Uses a pooled emitter per colour+texture. */
  burst(x: number, y: number, color = 0xffffff, o: { count?: number; speed?: number; life?: number; scale?: number; texture?: string; gravityY?: number; angle?: { min: number; max: number } } = {}) {
    const tex = o.texture ?? 'juice-dot';
    const key = `${tex}:${color}`;
    const P = this.burstParams;
    P.speed = o.speed ?? 300; P.life = o.life ?? 500; P.scale = o.scale ?? 0.9;
    P.amin = o.angle?.min ?? 0; P.amax = o.angle?.max ?? 360;
    let e = this.emitters.get(key);
    if (!e) {
      const r = Phaser.Math.FloatBetween;
      e = this.scene.add.particles(0, 0, tex, {
        emitting: false, blendMode: 'ADD', tint: color,
        speed: () => r(P.speed * 0.2, P.speed),
        lifespan: () => r(P.life * 0.5, P.life),
        angle: () => r(P.amin, P.amax),
        scale: { onEmit: (p: any) => (p.s0 = P.scale), onUpdate: (p: any, _k: string, t: number) => p.s0 * (1 - t) },
        alpha: { start: 1, end: 0 },
      }).setDepth(this.depth);
      this.emitters.set(key, e);
    }
    e.gravityY = o.gravityY ?? 0;
    e.explode(o.count ?? 14, x, y);
    return e;
  }
  private burstParams = { speed: 300, life: 500, scale: 0.9, amin: 0, amax: 360 };

  /** Floating text that rises and fades (damage numbers, +score, "PERFECT!"). */
  pop(x: number, y: number, text: string, o: { color?: string; size?: number; rise?: number; ms?: number; font?: string; stroke?: string } = {}) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: o.font ?? FONTS.display, fontSize: `${o.size ?? 18}px`, color: o.color ?? '#ffffff',
      stroke: o.stroke ?? '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(this.depth + 5).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: t, y: y - (o.rise ?? 40), alpha: 0, delay: (o.ms ?? 600) * 0.4, duration: (o.ms ?? 600) * 0.6, ease: 'Quad.In', onComplete: () => t.destroy() });
    return t;
  }

  /** Expanding ring — shockwaves, pickups, spawn telegraphs. */
  ring(x: number, y: number, color = 0xffffff, o: { radius?: number; ms?: number; width?: number; from?: number } = {}) {
    const c = this.scene.add.circle(x, y, o.radius ?? 60).setStrokeStyle(o.width ?? 4, color).setDepth(this.depth).setBlendMode('ADD');
    c.isFilled = false;
    c.setScale(o.from ?? 0.1);
    this.scene.tweens.add({ targets: c, scale: 1, alpha: 0, duration: o.ms ?? 350, ease: 'Cubic.Out', onComplete: () => c.destroy() });
    return c;
  }

  /** Squash & stretch: juice.squash(player, 1.3, 0.7) on landing/jumping. */
  squash(obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, sx = 1.25, sy = 0.75, ms = 160) {
    const bx = (obj as any).__baseSX ?? ((obj as any).__baseSX = obj.scaleX);
    const by = (obj as any).__baseSY ?? ((obj as any).__baseSY = obj.scaleY);
    this.scene.tweens.killTweensOf(obj);
    obj.setScale(bx * sx, by * sy);
    this.scene.tweens.add({ targets: obj, scaleX: bx, scaleY: by, duration: ms, ease: 'Back.Out' });
  }

  /** Quick zoom-in-and-back on the main camera. */
  zoomPunch(amount = 1.05, ms = 220) {
    const cam = this.scene.cameras.main;
    cam.setZoom(this.baseZoom * amount);
    cam.zoomTo(this.baseZoom, ms, 'Quad.easeOut', true); // camera effects need exact EaseMap names, unlike tweens
  }

  /** Full-screen colour flash (e.g. red on damage). */
  screenFlash(color = 0xffffff, alpha = 0.35, ms = 180) {
    const cam = this.scene.cameras.main;
    cam.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255, true);
    void alpha;
  }
}
