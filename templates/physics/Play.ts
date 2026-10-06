/**
 * Physics destruction starter (Matter.js): slingshot a heavy orb into structures, pop every target.
 * Patterns: drag-to-aim with trajectory preview, impact-based breaking via collision events,
 * "wait for the world to settle" before the next turn.
 */
import Phaser from 'phaser';
import { Juice } from '@kit/phaser/juice';
import { draw, dot, neon, gradient } from '@kit/phaser/textures';
import { text } from '@kit/phaser/ui';
import { enablePause } from '@kit/phaser/scenes';
import { playtest } from '@kit/phaser/boot';
import { tune } from '@kit/tune';
import { sfx, music } from '@kit/audio';
import { ANCHOR, BREAK, GROUND, LEVELS, SHOT, W, H, type Piece } from './config';

const SIZES = { post: [20, 100], beam: [120, 18], box: [40, 40] } as const;
const COL = { post: 0x9b6bd6, beam: 0x7a5cff, box: 0xb48cff, target: 0x5dffa0, orb: 0xffb84d };

export function makeArt(s: Phaser.Scene) {
  if (s.textures.exists('orb')) return;
  for (const [k, [w, h]] of Object.entries(SIZES)) draw(s, k, w, h, (c) => {
    c.fillStyle = '#ffffff'; c.globalAlpha = 0.35; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  neon(s, 'target', 'circle', 34, { core: true, glow: 6 });
  draw(s, 'orb', 32, 32, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(16, 16, 15, 0, Math.PI * 2); c.fill(); });
  dot(s, 'spark', 8); dot(s, 'aimdot', 4, 0.8);
  gradient(s, 'sky', W, H, 0x0b0820, 0x2a1a4a);
}
tune(SHOT, 'Shot'); tune(BREAK, 'Breaking');

type MImg = Phaser.Physics.Matter.Image;

export class Play extends Phaser.Scene {
  constructor() { super('Play'); }
  juice!: Juice;
  level = 0; shots = 0; score = 0; targets = 0;
  orb: MImg | null = null; aiming = false; flying = false; settleT = 0; over = false;
  aim!: Phaser.GameObjects.Graphics; band!: Phaser.GameObjects.Graphics; hud!: Phaser.GameObjects.Text;

  create(data: { level?: number; score?: number }) {
    makeArt(this);
    this.juice = new Juice(this);
    enablePause(this, { hint: 'R restart level' });
    this.level = data?.level ?? 0; this.score = data?.score ?? 0;
    Object.assign(this, { shots: SHOT.shots, targets: 0, orb: null, aiming: false, flying: false, over: false });
    this.matter.world.setBounds(-400, -2000, W + 800, GROUND + 2000, 64, true, true, false, true);
    this.matter.world.engine.enableSleeping = true;
    this.add.image(0, 0, 'sky').setOrigin(0);
    this.add.rectangle(W / 2, GROUND + 20, W + 800, 40, 0x1a1030).setStrokeStyle(2, 0x7a5cff);
    this.add.rectangle(ANCHOR.x, GROUND - 80, 14, 160, 0x3a2a5e).setStrokeStyle(2, 0x9b6bd6);
    this.aim = this.add.graphics(); this.band = this.add.graphics().setDepth(5);

    for (const [type, x, y] of LEVELS[this.level]) this.place(type, x, y);
    this.hud = text(this, 20, 20, '', { size: 18, origin: [0, 0] });
    text(this, W / 2, 30, `LEVEL ${this.level + 1}`, { size: 22, color: '#ffb84d' });
    this.newOrb();

    this.matter.world.on('collisionstart', (ev: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      for (const { bodyA, bodyB } of ev.pairs) {
        const impact = Math.hypot(bodyA.velocity.x - bodyB.velocity.x, bodyA.velocity.y - bodyB.velocity.y);
        for (const b of [bodyA, bodyB]) {
          const go = b.gameObject as MImg | null;
          if (!go?.active) continue;
          if (go.getData('type') === 'target' && impact > BREAK.targetImpact) this.popTarget(go);
          else if (go.getData('type') !== 'orb' && go.getData('type') && impact > BREAK.blockImpact) this.crack(go);
        }
        if (impact > 4) { sfx.play('thud', { volume: Math.min(1, impact / 15) }); if (impact > 8) this.juice.shake(Math.min(0.5, impact / 40)); }
      }
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.orb && !this.flying && Phaser.Math.Distance.Between(p.x, p.y, ANCHOR.x, ANCHOR.y) < 90) this.aiming = true; });
    this.input.on('pointerup', () => { if (this.aiming) this.launch(); });
    this.input.keyboard!.on('keydown-R', () => this.scene.restart({ level: this.level, score: 0 }));
    music.setIntensity(1);
    this.cameras.main.fadeIn(250);
  }

  place(type: Piece[0], x: number, y: number) {
    const img = type === 'target'
      ? this.matter.add.image(x, y, 'target', undefined, { shape: { type: 'circle', radius: 17 }, density: 0.0015, restitution: 0.3 }).setTint(COL.target).setBlendMode('ADD')
      : this.matter.add.image(x, y, type, undefined, { density: type === 'box' ? 0.002 : 0.0012, friction: 0.8 }).setTint(COL[type]);
    img.setData('type', type);
    if (type === 'target') this.targets++;
    return img;
  }

  newOrb() {
    if (this.over) return;
    this.orb = this.matter.add.image(ANCHOR.x, ANCHOR.y, 'orb', undefined, { shape: { type: 'circle', radius: SHOT.ballRadius }, density: SHOT.ballDensity, restitution: 0.25, frictionAir: 0.002 }).setTint(COL.orb).setStatic(true).setData('type', 'orb');
    // fade, never scale: on Matter objects setScale also rescales the physics body (from 0 = NaN)
    this.orb.setAlpha(0); this.tweens.add({ targets: this.orb, alpha: 1, duration: 200 });
    this.flying = false;
  }

  pull() {
    const p = this.input.activePointer;
    const dx = p.x - ANCHOR.x, dy = p.y - ANCHOR.y, d = Math.hypot(dx, dy) || 1, k = Math.min(d, SHOT.maxPull) / d;
    return { x: dx * k, y: dy * k };
  }

  launch() {
    this.aiming = false; this.aim.clear(); this.band.clear();
    const o = this.orb!, v = this.pull();
    if (Math.hypot(v.x, v.y) < 20) { o.setPosition(ANCHOR.x, ANCHOR.y); return; }
    o.setStatic(false).setVelocity(-v.x * SHOT.power, -v.y * SHOT.power);
    this.flying = true; this.settleT = 0; this.shots--;
    sfx.play('jump', { rate: 0.6 }); this.juice.ring(ANCHOR.x, ANCHOR.y, COL.orb, { radius: 40 });
  }

  popTarget(t: MImg) {
    if (!t.active) return;
    this.juice.burst(t.x, t.y, COL.target, { count: 26, speed: 320 });
    this.juice.ring(t.x, t.y, COL.target, { radius: 60 });
    this.juice.pop(t.x, t.y - 20, '+1000', { color: '#5dffa0', size: 22 });
    this.juice.hitstop(60); this.juice.shake(0.35);
    sfx.play('explode');
    t.destroy();
    this.score += 1000; this.targets--;
    if (this.targets <= 0) this.time.delayedCall(800, () => this.levelDone());
  }

  crack(b: MImg) {
    const hits = (b.getData('hits') ?? 0) + 1;
    b.setData('hits', hits).setAlpha(1 - hits * 0.3);
    this.juice.burst(b.x, b.y, 0xb48cff, { count: 6, speed: 120 });
    if (hits >= 3) { this.juice.burst(b.x, b.y, 0x9b6bd6, { count: 18, speed: 220 }); sfx.play('hit'); b.destroy(); this.score += 50; }
  }

  levelDone() {
    if (this.over) return;
    this.over = true;
    this.score += this.shots * 500;
    sfx.notes('select', [0, 4, 7, 12], 0.08);
    const next = this.level + 1;
    if (next < LEVELS.length) this.scene.restart({ level: next, score: this.score });
    else this.scene.start('GameOver', { won: true, score: this.score, stats: [['LEVELS', String(LEVELS.length)]] });
  }

  update(_t: number, ms: number) {
    const dt = ms / 1000;
    this.aim.clear(); this.band.clear();
    if (this.aiming && this.orb) {
      const v = this.pull();
      this.orb.setPosition(ANCHOR.x + v.x, ANCHOR.y + v.y);
      this.band.lineStyle(4, 0xffb84d, 0.8).lineBetween(ANCHOR.x - 6, ANCHOR.y, this.orb.x, this.orb.y).lineBetween(ANCHOR.x + 6, ANCHOR.y, this.orb.x, this.orb.y);
      // trajectory preview: Matter velocity is px per 16.67ms step; gravity adds ~0.278 px/step² at gravity 1
      let x = this.orb.x, y = this.orb.y, vx = -v.x * SHOT.power, vy = -v.y * SHOT.power;
      this.aim.fillStyle(0xffffff, 0.6);
      for (let i = 0; i < 60; i++) { x += vx; vy += 0.278; y += vy; if (i % 3 === 0) this.aim.fillCircle(x, y, 3 - i / 40); if (y > GROUND) break; }
    }
    // remove things that fell off the world; targets that fall count as popped
    for (const b of this.matter.world.getAllBodies()) {
      const go = b.gameObject as MImg | null;
      if (go?.active && go.y > H + 100) { if (go.getData('type') === 'target') this.popTarget(go); else if (go !== this.orb) go.destroy(); }
    }
    if (this.flying && this.orb) {
      this.settleT += dt;
      const moving = this.matter.world.getAllBodies().some((b) => !b.isStatic && !b.isSleeping && b.speed > 0.3);
      if ((!moving && this.settleT > 1.2) || this.settleT > SHOT.settleSeconds || this.orb.x > W + 300 || this.orb.y > H + 100) {
        this.orb.destroy(); this.orb = null; this.flying = false;
        if (this.targets > 0 && this.shots <= 0) { this.over = true; this.time.delayedCall(400, () => this.scene.start('GameOver', { won: false, title: 'OUT OF SHOTS', score: this.score, stats: [['LEVEL', String(this.level + 1)], ['TARGETS LEFT', String(this.targets)]] })); }
        else if (this.targets > 0) this.newOrb();
      }
    }
    this.hud.setText(`SCORE ${this.score}    ORBS ${'●'.repeat(Math.max(0, this.shots))}`);
    playtest({ level: this.level, score: this.score, targets: this.targets, shots: this.shots });
  }
}
