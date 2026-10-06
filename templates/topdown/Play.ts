/**
 * Twin-stick arena shooter starter. Patterns worth keeping for any "lots of things on screen" game:
 * plain-object entities + Pool + SpatialHash (fast), Director for waves, Upgrades + chooseCard for level-ups.
 * games/neon-swarm is the fully-polished big brother of this file.
 */
import Phaser from 'phaser';
import { Juice } from '@kit/phaser/juice';
import { neon, dot, streak, grid, vignette } from '@kit/phaser/textures';
import { text, bar, clock } from '@kit/phaser/ui';
import { enablePause } from '@kit/phaser/scenes';
import { chooseCard } from '@kit/phaser/cards';
import { playtest } from '@kit/phaser/boot';
import { tune, action } from '@kit/tune';
import { Pool } from '@kit/pool';
import { SpatialHash } from '@kit/spatial';
import { Director } from '@kit/director';
import { Upgrades } from '@kit/upgrades';
import { sfx, music } from '@kit/audio';
import { damp, clamp, TAU } from '@kit/math';
import { rng } from '@kit/rng';
import { ARENA, BASE, ENEMY, SPAWN, W, H, xpFor, type EnemyKind, type Stats } from './config';

export function makeArt(s: Phaser.Scene) {
  if (s.textures.exists('ship')) return;
  neon(s, 'ship', 'ship', 36, { fill: 0.25 });
  streak(s, 'bullet', 18, 5);
  neon(s, 'grunt', 'triangle', 30); neon(s, 'runner', 'diamond', 24); neon(s, 'tank', 'hex', 62, { core: true });
  neon(s, 'xp', 'gem', 12, { fill: 0.7 });
  dot(s, 'spark', 8);
  grid(s, 'grid', 80, 0x1b2550, 0.9, 2);
  vignette(s, 'vig', W, H, 0.7);
}
tune(BASE, 'Base stats (applies on retry: R)');
tune(SPAWN, 'Spawning');
const q = new URLSearchParams(location.search);

class Enemy { alive = false; kind: EnemyKind = 'grunt'; x = 0; y = 0; vx = 0; vy = 0; r = 10; hp = 1; constructor(public img: Phaser.GameObjects.Image) {} }
class Bullet { alive = false; x = 0; y = 0; vx = 0; vy = 0; life = 0; pierce = 0; hit = new Set<Enemy>(); constructor(public img: Phaser.GameObjects.Image) {} }
class Gem { alive = false; x = 0; y = 0; v = 1; pulled = false; constructor(public img: Phaser.GameObjects.Image) {} }

export class Play extends Phaser.Scene {
  constructor() { super('Play'); }
  juice!: Juice; stats!: Stats; dir!: Director; ups!: Upgrades<Stats>;
  enemies!: Pool<Enemy>; bullets!: Pool<Bullet>; gems!: Pool<Gem>;
  hash = new SpatialHash<Enemy>(80);
  ship!: Phaser.GameObjects.Image;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  hpBar!: ReturnType<typeof bar>; xpBar!: ReturnType<typeof bar>; hud!: Phaser.GameObjects.Text;
  px = ARENA / 2; py = ARENA / 2; vx = 0; vy = 0; aim = 0;
  fireT = 0; dashT = 0; dashCd = 0; inv = 0;
  hp = 5; xp = 0; level = 1; score = 0; kills = 0; over = false; picking = false;

  create() {
    makeArt(this);
    this.juice = new Juice(this);
    enablePause(this);
    this.stats = { ...BASE };
    Object.assign(this, { px: ARENA / 2, py: ARENA / 2, vx: 0, vy: 0, fireT: 0, dashT: 0, dashCd: 0, inv: 1, hp: BASE.maxHp, xp: 0, level: 1, score: 0, kills: 0, over: false, picking: false });
    this.ups = new Upgrades<Stats>([
      { id: 'rate', name: 'Overclock', desc: '+25% fire rate', max: 6, weight: 10, apply: (s) => (s.fireRate *= 1.25) },
      { id: 'multi', name: 'Split Shot', desc: '+1 projectile', max: 5, weight: 7, apply: (s) => s.projectiles++ },
      { id: 'dmg', name: 'Heavy Rounds', desc: '+40% damage', max: 6, weight: 9, apply: (s) => (s.damage *= 1.4) },
      { id: 'pierce', name: 'Piercing', desc: 'Bullets pass through +1 enemy', max: 4, weight: 6, apply: (s) => s.pierce++ },
      { id: 'speed', name: 'Thrusters', desc: '+15% move speed', max: 4, weight: 6, apply: (s) => (s.speed *= 1.15) },
      { id: 'magnet', name: 'Magnet', desc: '+60% pickup range', max: 3, weight: 5, apply: (s) => (s.magnet *= 1.6) },
      { id: 'hp', name: 'Plating', desc: '+1 max HP, full heal', max: 4, weight: 5, apply: (s) => (s.maxHp += 1) },
    ]);
    this.dir = new Director({
      waveLength: SPAWN.waveLength, maxAlive: SPAWN.maxAlive, startBudget: 5,
      budget: (wave) => SPAWN.baseBudget + SPAWN.perWave * (wave - 1),
      spawns: [
        { id: 'grunt', cost: 1, weight: 10, group: [3, 6] },
        { id: 'runner', cost: 1.5, weight: 6, from: 2, group: [2, 4] },
        { id: 'tank', cost: 8, weight: 2, from: 3 },
      ],
      onSpawn: (id, n) => this.spawnPack(id as EnemyKind, n),
      onWave: (w) => { this.banner(`WAVE ${w}`); music.setIntensity(Math.min(3, w - 1)); sfx.play('powerup'); },
    });

    this.add.tileSprite(0, 0, ARENA, ARENA, 'grid').setOrigin(0).setAlpha(0.45);
    this.add.rectangle(0, 0, ARENA, ARENA).setOrigin(0).setStrokeStyle(6, 0x7a5cff).isFilled = false;
    const img = (key: string, depth: number) => () => this.add.image(0, 0, key).setVisible(false).setBlendMode('ADD').setDepth(depth);
    this.enemies = new Pool(() => new Enemy(img('grunt', 10)()));
    this.bullets = new Pool(() => new Bullet(img('bullet', 20)().setTint(0xaefcff)));
    this.gems = new Pool(() => new Gem(img('xp', 5)().setTint(0x5dffa0)));
    this.ship = this.add.image(this.px, this.py, 'ship').setTint(0x33f0ff).setBlendMode('ADD').setDepth(30);
    this.cameras.main.startFollow(this.ship, false, 0.1, 0.1).setBounds(-200, -200, ARENA + 400, ARENA + 400).fadeIn(250);

    // HUD (scrollFactor 0 = stays on screen)
    this.add.image(W / 2, H / 2, 'vig').setScrollFactor(0).setDepth(90);
    this.xpBar = bar(this, 0, 4, W, 8, 0x5dffa0).setScrollFactor(0).setDepth(100).set(0, true);
    this.hpBar = bar(this, 20, 30, 200, 14, 0xff3366).setScrollFactor(0).setDepth(100);
    this.hud = text(this, W - 20, 30, '', { size: 20, origin: [1, 0.5] }).setScrollFactor(0).setDepth(100);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => this.dash());
    kb.on('keydown-SHIFT', () => this.dash());
    action('Level up', () => (this.xp = xpFor(this.level)));
    action('Spawn tank', () => this.spawnPack('tank', 1));
    this.time.delayedCall(300, () => this.banner('WAVE 1'));
  }

  banner(msg: string) {
    const t = text(this, W / 2, H * 0.3, msg, { size: 56, color: '#ff3df0', shadow: true }).setScrollFactor(0).setDepth(100).setScale(1.5).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 400, onComplete: () => t.destroy() });
  }

  spawnPack(kind: EnemyKind, n: number) {
    const a = rng.range(0, TAU), d = rng.range(650, 800);
    const cx = clamp(this.px + Math.cos(a) * d, 40, ARENA - 40), cy = clamp(this.py + Math.sin(a) * d, 40, ARENA - 40);
    for (let i = 0; i < n; i++) {
      const e = this.enemies.get(), def = ENEMY[kind];
      Object.assign(e, { alive: true, kind, x: cx + rng.range(-40, 40), y: cy + rng.range(-40, 40), vx: 0, vy: 0, r: def.r, hp: def.hp * (1 + (this.dir.wave - 1) * 0.15) });
      e.img.setTexture(kind).setTint(def.color).setVisible(true).setScale(0);
      this.tweens.add({ targets: e.img, scale: 1, duration: 250 });
    }
  }

  dash() {
    if (this.dashCd > 0 || this.over) return;
    this.dashT = 0.15; this.dashCd = this.stats.dashCd; this.inv = Math.max(this.inv, 0.25);
    sfx.play('dash'); this.juice.ring(this.px, this.py, 0x33f0ff, { radius: 40 });
  }

  update(_t: number, ms: number) {
    const dt = Math.min(ms / 1000, 1 / 20) * this.juice.timeScale;
    if (dt <= 0) return;
    const S = this.stats;
    if (!this.over) {
      // --- move
      const k = this.keys;
      let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
      this.dashT -= dt; this.dashCd -= dt; this.inv -= dt;
      const sp = this.dashT > 0 ? S.speed * 3.5 : S.speed;
      this.vx = damp(this.vx, ix * sp, S.accel, dt); this.vy = damp(this.vy, iy * sp, S.accel, dt);
      this.px = clamp(this.px + this.vx * dt, 15, ARENA - 15); this.py = clamp(this.py + this.vy * dt, 15, ARENA - 15);
      const p = this.input.activePointer, wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.aim = Math.atan2(wp.y - this.py, wp.x - this.px);
      this.ship.setPosition(this.px, this.py).setRotation(this.aim).setAlpha(this.inv > 0 ? 0.5 : 1);
      // --- fire
      this.fireT += dt;
      if (this.fireT >= 1 / S.fireRate) {
        this.fireT = 0;
        for (let i = 0; i < S.projectiles; i++) {
          const a = this.aim + (i - (S.projectiles - 1) / 2) * 0.14, b = this.bullets.get();
          Object.assign(b, { alive: true, x: this.px, y: this.py, vx: Math.cos(a) * S.bulletSpeed, vy: Math.sin(a) * S.bulletSpeed, life: S.bulletLife, pierce: S.pierce });
          b.hit.clear(); b.img.setVisible(true).setRotation(a);
        }
        sfx.play('shoot');
      }
      this.dir.update(dt, this.enemies.count());
    }

    // --- enemies
    this.hash.rebuild(this.enemies.alive());
    this.enemies.each((e) => {
      const d = ENEMY[e.kind], dx = this.px - e.x, dy = this.py - e.y, dd = Math.hypot(dx, dy) || 1;
      e.vx = damp(e.vx, (dx / dd) * d.speed, 3, dt); e.vy = damp(e.vy, (dy / dd) * d.speed, 3, dt);
      this.hash.query(e.x, e.y, e.r + 30, (o) => { if (o !== e) { const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy) || 1; if (od < e.r + o.r) { e.x += (ox / od) * 1.5; e.y += (oy / od) * 1.5; } } });
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.img.setPosition(e.x, e.y).setRotation(Math.atan2(e.vy, e.vx));
      if (!this.over && this.inv <= 0 && dd < e.r + 12) this.hurt();
    });
    // --- bullets
    this.bullets.each((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) { b.alive = false; b.img.setVisible(false); return; }
      b.img.setPosition(b.x, b.y);
      let hit: Enemy | null = null;
      this.hash.query(b.x, b.y, 40, (e, d2) => { if (!hit && e.alive && !b.hit.has(e) && d2 < (e.r + 5) ** 2) hit = e; });
      if (!hit) return;
      const e: Enemy = hit;
      b.hit.add(e);
      e.hp -= S.damage; e.x += b.vx * 0.015; e.y += b.vy * 0.015;
      this.juice.flash(e.img, 50);
      if (e.hp <= 0) this.kill(e); else sfx.play('hit', { volume: 0.5 });
      if (b.pierce-- <= 0) { b.alive = false; b.img.setVisible(false); }
    });
    // --- xp gems
    this.gems.each((g) => {
      const dx = this.px - g.x, dy = this.py - g.y, d = Math.hypot(dx, dy) || 1;
      if (d < S.magnet) g.pulled = true;
      if (g.pulled) { g.x += (dx / d) * 700 * dt; g.y += (dy / d) * 700 * dt; g.img.setPosition(g.x, g.y); }
      if (d < 20 && !this.over) { g.alive = false; g.img.setVisible(false); this.xp += g.v; sfx.play('pickup', { volume: 0.5 }); }
    });
    if (this.xp >= xpFor(this.level) && !this.picking && !this.over) this.levelUp();

    this.hpBar.set(this.hp / S.maxHp);
    this.xpBar.set(this.xp / xpFor(this.level), true);
    this.hud.setText(`${this.score.toLocaleString()}   LV ${this.level}   ${clock(this.dir.time)}`);
    playtest({ score: this.score, wave: this.dir.wave, level: this.level, hp: this.hp, kills: this.kills, alive: this.enemies.count() });
  }

  kill(e: Enemy) {
    const d = ENEMY[e.kind];
    e.alive = false; e.img.setVisible(false);
    this.kills++; this.score += d.score;
    this.juice.burst(e.x, e.y, d.color, { count: 10 + e.r, speed: 250 });
    this.juice.shake(e.r > 20 ? 0.4 : 0.08);
    if (e.r > 20) this.juice.hitstop(50);
    sfx.play('explode', { volume: 0.5 });
    for (let i = 0; i < d.xp; i++) { const g = this.gems.get(); Object.assign(g, { alive: true, x: e.x + rng.range(-10, 10), y: e.y + rng.range(-10, 10), v: 1, pulled: false }); g.img.setVisible(true).setPosition(g.x, g.y); }
  }

  async levelUp() {
    this.picking = true;
    this.xp -= xpFor(this.level); this.level++;
    sfx.notes('blip', [0, 4, 7, 12], 0.06);
    const offer = this.ups.offer(3);
    const i = await chooseCard(this, { title: `LEVEL ${this.level}`, cards: offer.map((u) => ({ name: u.name, desc: u.desc, color: 0x33f0ff, tag: `LV ${this.ups.level(u.id) + 1}/${u.max}` })) });
    const u = this.ups.take(offer[i].id, this.stats);
    if (u.id === 'hp') this.hp = this.stats.maxHp;
    this.juice.ring(this.px, this.py, 0x5dffa0, { radius: 120 }); this.juice.zoomPunch(1.05);
    this.inv = 0.8; this.picking = false;
  }

  hurt() {
    if (q.has('god')) return;
    this.hp--; this.inv = 1.2;
    sfx.play('hurt'); this.juice.shake(0.8, 250); this.juice.hitstop(80); this.juice.screenFlash(0xff2244);
    this.hash.query(this.px, this.py, 180, (e) => { const dx = e.x - this.px, dy = e.y - this.py, d = Math.hypot(dx, dy) || 1; e.x += (dx / d) * 80; e.y += (dy / d) * 80; });
    if (this.hp > 0) return;
    this.over = true; this.ship.setVisible(false);
    this.juice.burst(this.px, this.py, 0x33f0ff, { count: 50, speed: 500, life: 1000 });
    sfx.play('bigBoom'); this.juice.slowmo(0.3, 800);
    this.time.delayedCall(1000, () => this.scene.start('GameOver', { score: this.score, stats: [['WAVE', String(this.dir.wave)], ['LEVEL', String(this.level)], ['KILLS', String(this.kills)], ['TIME', clock(this.dir.time)]] }));
  }
}
