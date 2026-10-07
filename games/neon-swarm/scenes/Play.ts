import Phaser from 'phaser';
import { Juice } from '@kit/phaser/juice';
import { sfx, music, SONGS } from '@kit/audio';
import { SpatialHash } from '@kit/spatial';
import { Pool } from '@kit/pool';
import { clamp, damp, TAU } from '@kit/math';
import { rng } from '@kit/rng';
import { playtest } from '@kit/phaser/boot';
import { sound } from '@kit/assets';
const voice = (line: string) => sound.play(`voiceover-pack/${line}`, { volume: 0.85, minGap: 0 });
import { makeArt } from '../art';
import { ARENA, BASE_STATS, C, DIRECTOR, PLAYER, type Stats, xpForLevel } from '../config';
import { ENEMIES, UPGRADES, type Kind, type EnemyDef } from '../data';

type Img = Phaser.GameObjects.Image;

class Enemy {
  alive = false; kind: Kind = 'drone'; def: EnemyDef = ENEMIES.drone;
  x = 0; y = 0; vx = 0; vy = 0; kx = 0; ky = 0; r = 10;
  hp = 1; maxHp = 1; t = 0; state = 0; timer = 0; ax = 0; ay = 0;
  orbitCd = 0; dashHitCd = 0; age = 0;
  constructor(public img: Img) {}
}
class Bullet {
  alive = false; x = 0; y = 0; vx = 0; vy = 0; r = 6; life = 0; dmg = 1; pierce = 0; rico = 0;
  hit = new Set<Enemy>();
  constructor(public img: Img) {}
}
class EBullet { alive = false; x = 0; y = 0; vx = 0; vy = 0; r = 7; life = 0; constructor(public img: Img) {} }
type GemKind = 'xp' | 'heart' | 'vacuum';
class Gem { alive = false; x = 0; y = 0; vx = 0; vy = 0; value = 1; pulled = false; kind: GemKind = 'xp'; age = 0; constructor(public img: Img) {} }
interface Boom { x: number; y: number; r: number; dmg: number; t: number }
interface PendingSpawn { x: number; y: number; kind: Kind; count: number; t: number; marker: Img }

export interface RunState {
  hp: number; maxHp: number; xp: number; xpNext: number; level: number; score: number;
  combo: number; bestCombo: number; mult: number; kills: number; time: number; wave: number;
  dash: number; boss: { hp: number; max: number } | null; upgrades: Record<string, number>;
  over: boolean; autoAim: boolean; alive: number;
}

export class Play extends Phaser.Scene {
  constructor() { super('Play'); }

  juice!: Juice;
  stats!: Stats;
  run!: RunState;

  player!: Img;
  px = 0; py = 0; pvx = 0; pvy = 0; aim = 0;
  invuln = 0; dashT = 0; dashCd = 0; dashDx = 0; dashDy = 0; ghostT = 0;
  fireT = 0; novaT = 0; orbitA = 0; comboT = 0; pickupChain = 0; pickupT = 0;
  waveT = 0; budget = 6; regenWaves = 0;
  boss: Enemy | null = null; bossCount = 0;

  enemies!: Pool<Enemy>;
  bullets!: Pool<Bullet>;
  ebullets!: Pool<EBullet>;
  gems!: Pool<Gem>;
  orbitals: Img[] = [];
  hash = new SpatialHash<Enemy>(80);
  booms: Boom[] = [];
  spawns: PendingSpawn[] = [];
  tele!: Phaser.GameObjects.Graphics;
  bg!: Phaser.GameObjects.TileSprite;
  thrust!: Phaser.GameObjects.Particles.ParticleEmitter;

  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  dashQueued = false;
  lastTap = 0;
  touchMove: { x: number; y: number } | null = null;
  padDashWas = false;
  levelUpOpen = false;
  pendingLevels = 0;
  pops = 0;
  /** Debug/playtest URL params: ?autoaim ?god ?wave=5 ?level=10 */
  q = new URLSearchParams(location.search);

  create() {
    makeArt(this);
    this.juice = new Juice(this, 60);
    this.stats = { ...BASE_STATS };
    this.run = {
      hp: BASE_STATS.maxHp, maxHp: BASE_STATS.maxHp, xp: 0, xpNext: xpForLevel(1), level: 1, score: 0,
      combo: 0, bestCombo: 0, mult: 1, kills: 0, time: 0, wave: 1, dash: 1, boss: null, upgrades: {},
      over: false, autoAim: this.registry.get('autoAim') ?? false, alive: 0,
    };
    if (this.q.has('autoaim')) this.run.autoAim = true;
    this.registry.set('run', this.run);
    Object.assign(this, {
      px: ARENA / 2, py: ARENA / 2, pvx: 0, pvy: 0, invuln: 1.5, dashT: 0, dashCd: 0, fireT: 0, novaT: 0,
      comboT: 0, waveT: 0, budget: 6, boss: null, bossCount: 0, booms: [], spawns: [], orbitals: [],
      levelUpOpen: false, pendingLevels: 0, regenWaves: 0, pops: 0,
    });

    // --- world
    this.add.rectangle(-2000, -2000, ARENA + 4000, ARENA + 4000, 0x04050d).setOrigin(0).setDepth(-20);
    for (let i = 0; i < 260; i++) {
      const sf = rng.range(0.2, 0.6);
      this.add.image(rng.range(-800, ARENA + 800), rng.range(-800, ARENA + 800), 'spark')
        .setScale(rng.range(0.1, 0.35)).setAlpha(rng.range(0.2, 0.7)).setTint(rng.pick([0x6688ff, 0xaa66ff, 0x66ddff, 0xffffff]))
        .setScrollFactor(sf).setDepth(-15);
    }
    this.bg = this.add.tileSprite(0, 0, ARENA, ARENA, 'grid').setOrigin(0).setAlpha(0.45).setDepth(-10);
    const border = this.add.rectangle(0, 0, ARENA, ARENA).setOrigin(0).setStrokeStyle(8, C.border, 0.9).setDepth(-5);
    border.isFilled = false;
    this.add.rectangle(0, 0, ARENA, ARENA).setOrigin(0).setStrokeStyle(24, C.border, 0.15).setDepth(-5).isFilled = false;
    this.tele = this.add.graphics().setDepth(5).setBlendMode('ADD');

    // --- pools
    this.enemies = new Pool(() => new Enemy(this.add.image(0, 0, 'e-drone').setVisible(false).setDepth(10).setBlendMode('ADD')));
    this.bullets = new Pool(() => new Bullet(this.add.image(0, 0, 'bullet').setVisible(false).setDepth(20).setBlendMode('ADD').setTint(C.bullet)));
    this.ebullets = new Pool(() => new EBullet(this.add.image(0, 0, 'ebullet').setVisible(false).setDepth(25).setBlendMode('ADD').setTint(C.enemyBullet)));
    this.gems = new Pool(() => new Gem(this.add.image(0, 0, 'gem').setVisible(false).setDepth(8).setBlendMode('ADD')));

    // --- player
    this.thrust = this.add.particles(0, 0, 'spark', {
      emitting: false, blendMode: 'ADD', tint: [C.player, 0x3388ff], lifespan: 280, speed: { min: 20, max: 80 },
      scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 },
    }).setDepth(29);
    this.player = this.add.image(this.px, this.py, 'player').setTint(C.player).setDepth(30).setBlendMode('ADD');
    this.add.image(0, 0, 'glow').setTint(C.player).setAlpha(0.18).setDepth(-1).setBlendMode('ADD').setName('pglow');

    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(-300, -300, ARENA + 600, ARENA + 600);
    cam.startFollow(this.player, false, 0.1, 0.1);
    cam.setBackgroundColor(0x04050d);
    // NOTE: no camera filters (bloom/vignette) here — in Phaser 4.2 they break ADD-blended sprites.
    // The glow is baked into the textures instead; the vignette is an overlay in the Hud.
    cam.fadeIn(400);

    // --- input
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.dashQueued = true));
    kb.on('keydown-SHIFT', () => (this.dashQueued = true));
    kb.on('keydown-T', () => { this.run.autoAim = !this.run.autoAim; this.registry.set('autoAim', this.run.autoAim); this.events.emit('toast', `AUTO-AIM ${this.run.autoAim ? 'ON' : 'OFF'}`); });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.dashQueued = true;
      if (p.wasTouch) {
        if (p.downTime - this.lastTap < 280) this.dashQueued = true;
        this.lastTap = p.downTime;
        this.run.autoAim = true;
      }
    });

    // --- events
    this.events.on('upgrade', (id: string) => this.applyUpgrade(id));
    const unbeat = music.onBeat((b) => {
      if (!this.scene.isActive()) return;
      this.bg.setAlpha(b % 4 === 0 ? 0.75 : 0.58);
      this.tweens.add({ targets: this.bg, alpha: 0.45, duration: 380, ease: 'Quad.Out' });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { unbeat(); this.events.off('upgrade'); });

    this.scene.launch('Hud');
    this.scene.bringToTop('Hud');
    if (!music.playing) music.play(SONGS.synthwave);
    music.setIntensity(0);
    this.time.delayedCall(300, () => this.events.emit('banner', 'WAVE 1', 'survive'));
    const startWave = Number(this.q.get('wave') ?? 1);
    if (startWave > 1) { this.run.wave = startWave - 1; this.waveT = DIRECTOR.waveLength - 0.5; }
    const startLevel = Number(this.q.get('level') ?? 1);
    if (startLevel > 1) { this.pendingLevels = startLevel - 1; this.run.level = startLevel; this.run.xpNext = xpForLevel(startLevel); }
  }

  // ================================================================ update

  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 20) * this.juice.timeScale;
    if (dt <= 0) return;
    const R = this.run;
    if (!R.over) {
      R.time += dt;
      this.director(dt);
      this.updatePlayer(dt);
      this.fire(dt);
    }
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
    if (!R.over) { this.updateOrbitals(dt); this.updateNova(dt); }
    this.updateGems(dt);
    this.updateBooms(dt);
    if (!R.over) this.contact();

    this.comboT -= dt;
    if (this.comboT <= 0 && R.combo > 0) { R.combo = 0; R.mult = 1; }
    this.pickupT -= dt; if (this.pickupT <= 0) this.pickupChain = 0;
    R.alive = this.enemies.count();
    R.boss = this.boss ? { hp: this.boss.hp, max: this.boss.maxHp } : null;

    if (this.pendingLevels > 0 && !this.levelUpOpen && !R.over) this.openLevelUp();
    playtest({ score: R.score, wave: R.wave, level: R.level, hp: R.hp, kills: R.kills, alive: R.alive, over: R.over, time: Math.round(R.time) });
  }

  // ================================================================ director

  director(dt: number) {
    const R = this.run;
    if (!this.boss) this.waveT += dt;
    if (this.waveT >= DIRECTOR.waveLength) {
      this.waveT = 0;
      R.wave++;
      music.setIntensity(R.wave >= 6 ? 3 : R.wave >= 4 ? 2 : R.wave >= 2 ? 1 : 0);
      if (this.stats.regen > 0 && ++this.regenWaves >= 4 - this.stats.regen) { this.regenWaves = 0; this.heal(1); }
      if (R.wave % DIRECTOR.bossEvery === 0) this.spawnBoss();
      else { this.events.emit('banner', `WAVE ${R.wave}`, R.wave === 2 ? 'darts incoming' : R.wave === 3 ? 'splitters' : R.wave === 4 ? 'spitters' : R.wave === 6 ? 'brutes' : ''); sfx.play('powerup'); }
    }
    const rate = DIRECTOR.baseBudget + DIRECTOR.budgetPerWave * (R.wave - 1) + R.time * 0.004;
    this.budget += rate * dt * (this.boss ? 0.3 : 1);
    const alive = this.enemies.count();
    if (alive >= DIRECTOR.maxAlive) return;
    const pool: [Kind, number][] = [];
    for (const [k, d] of Object.entries(ENEMIES) as [Kind, EnemyDef][]) if (d.unlock <= R.wave) pool.push([k, ({ drone: 10, dart: 5, splitter: 4, spitter: 3, brute: 2 } as Record<string, number>)[k] ?? 0]);
    const kind = rng.weighted(pool);
    const def = ENEMIES[kind];
    const size = kind === 'drone' ? rng.int(3, 6) : kind === 'dart' ? rng.int(2, 4) : kind === 'brute' ? 1 : rng.int(1, 2);
    const cost = def.cost * size;
    if (this.budget < cost) return;
    this.budget -= cost;
    const [x, y] = this.spawnPoint();
    const marker = this.add.image(x, y, 'marker').setTint(def.color).setBlendMode('ADD').setDepth(4).setScale(0.3);
    this.tweens.add({ targets: marker, scale: 1.3 + size * 0.15, alpha: { from: 1, to: 0.4 }, duration: 160, yoyo: true, repeat: 2 });
    this.spawns.push({ x, y, kind, count: size, t: 0.85, marker });
  }

  spawnPoint(): [number, number] {
    for (let i = 0; i < 12; i++) {
      const a = rng.range(0, TAU), d = rng.range(640, 820);
      const x = clamp(this.px + Math.cos(a) * d, 60, ARENA - 60), y = clamp(this.py + Math.sin(a) * d, 60, ARENA - 60);
      if (Math.hypot(x - this.px, y - this.py) > 480) return [x, y];
    }
    return [rng.range(60, ARENA - 60), rng.range(60, ARENA - 60)];
  }

  updateSpawns(dt: number) {
    for (let i = this.spawns.length - 1; i >= 0; i--) {
      const s = this.spawns[i];
      s.t -= dt;
      if (s.t > 0) continue;
      s.marker.destroy();
      this.spawns.splice(i, 1);
      if (this.run.over) continue;
      for (let n = 0; n < s.count; n++) {
        const a = (n / s.count) * TAU, d = s.count > 1 ? 26 + s.count * 4 : 0;
        this.spawnEnemy(s.kind, s.x + Math.cos(a) * d, s.y + Math.sin(a) * d);
      }
      this.juice.ring(s.x, s.y, ENEMIES[s.kind].color, { radius: 50, ms: 300 });
      sfx.play('spawn', { volume: 0.6 });
    }
  }

  spawnEnemy(kind: Kind, x: number, y: number, vx = 0, vy = 0) {
    const e = this.enemies.get();
    const def = ENEMIES[kind];
    const scale = 1 + (this.run.wave - 1) * DIRECTOR.hpScalePerWave;
    Object.assign(e, { alive: true, kind, def, x, y, vx, vy, kx: 0, ky: 0, r: def.r, t: rng.range(0, 3), state: 0, timer: rng.range(0.5, 2), orbitCd: 0, dashHitCd: 0, age: 0 });
    e.hp = e.maxHp = def.hp * scale;
    e.img.setTexture(def.tex).setTint(def.color).setTintMode(Phaser.TintModes.MULTIPLY).setVisible(true).setAlpha(1).setScale(0.1).setPosition(x, y);
    (e.img as any).__flashing = false;
    this.tweens.add({ targets: e.img, scale: 1, duration: 250, ease: 'Back.Out' });
    return e;
  }

  spawnBoss() {
    this.bossCount++;
    const R = this.run;
    this.events.emit('banner', 'HIVE MOTHER', `wave ${R.wave} · kill it`, 0xff2255); voice('war_look_out');
    music.setIntensity(3);
    sfx.play('bigBoom', { volume: 0.6 });
    this.juice.shake(0.6, 500);
    const [x, y] = this.spawnPoint();
    const b = this.spawnEnemy('boss', x, y);
    b.hp = b.maxHp = ENEMIES.boss.hp * (1 + 0.7 * (this.bossCount - 1)) * (1 + (R.wave - 1) * 0.06);
    b.timer = 2;
    this.boss = b;
  }

  // ================================================================ player

  updatePlayer(dt: number) {
    const k = this.keys, S = this.stats;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const pad = this.input.gamepad?.total ? this.input.gamepad.pad1 : null;
    let padAim: number | null = null;
    if (pad) {
      const ls = pad.leftStick, rs = pad.rightStick;
      if (Math.hypot(ls.x, ls.y) > 0.2) { ix += ls.x; iy += ls.y; }
      if (Math.hypot(rs.x, rs.y) > 0.35) padAim = Math.atan2(rs.y, rs.x);
      const dashBtn = pad.R1 > 0.5 || pad.R2 > 0.5 || pad.A;
      if (dashBtn && !this.padDashWas) this.dashQueued = true;
      this.padDashWas = dashBtn;
    }
    const p = this.input.activePointer;
    if (p.wasTouch && p.isDown) {
      const cam = this.cameras.main;
      const wp = cam.getWorldPoint(p.x, p.y);
      const dx = wp.x - this.px, dy = wp.y - this.py, d = Math.hypot(dx, dy);
      if (d > 30) { ix = dx / d; iy = dy / d; }
    }
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }

    // dash
    this.dashCd -= dt;
    this.run.dash = clamp(1 - this.dashCd / S.dashCd, 0, 1);
    if (this.dashQueued && this.dashCd <= 0) {
      this.dashQueued = false;
      const dl = Math.hypot(ix, iy);
      this.dashDx = dl > 0.1 ? ix / dl : Math.cos(this.aim);
      this.dashDy = dl > 0.1 ? iy / dl : Math.sin(this.aim);
      this.dashT = PLAYER.dashTime; this.dashCd = S.dashCd;
      this.invuln = Math.max(this.invuln, PLAYER.dashTime + 0.08);
      sfx.play('dash');
      this.juice.ring(this.px, this.py, C.player, { radius: 40, ms: 200 });
    }
    this.dashQueued = false;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.pvx = this.dashDx * PLAYER.dashSpeed; this.pvy = this.dashDy * PLAYER.dashSpeed;
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.022;
        const g = this.add.image(this.px, this.py, 'ghost').setRotation(this.player.rotation).setTint(C.player).setAlpha(0.6).setBlendMode('ADD').setDepth(28);
        this.tweens.add({ targets: g, alpha: 0, scale: 0.6, duration: 260, onComplete: () => g.destroy() });
      }
    } else {
      this.pvx = damp(this.pvx, ix * S.moveSpeed, PLAYER.accel, dt);
      this.pvy = damp(this.pvy, iy * S.moveSpeed, PLAYER.accel, dt);
    }
    this.px = clamp(this.px + this.pvx * dt, PLAYER.radius, ARENA - PLAYER.radius);
    this.py = clamp(this.py + this.pvy * dt, PLAYER.radius, ARENA - PLAYER.radius);

    // aim
    const cam = this.cameras.main;
    if (padAim !== null) this.aim = padAim;
    else if (this.run.autoAim) {
      const t = this.hash.nearest(this.px, this.py, 650, (o) => o.alive);
      if (t) this.aim = Math.atan2(t.y - this.py, t.x - this.px);
      else if (il > 0.1) this.aim = Math.atan2(iy, ix);
    } else {
      const wp = cam.getWorldPoint(p.x, p.y);
      this.aim = Math.atan2(wp.y - this.py, wp.x - this.px);
    }

    this.player.setPosition(this.px, this.py).setRotation(this.aim);
    this.invuln -= dt;
    this.player.setAlpha(this.invuln > 0 && this.dashT <= 0 ? (Math.floor(this.invuln * 14) % 2 ? 0.25 : 1) : 1);
    (this.children.getByName('pglow') as Img).setPosition(this.px, this.py);

    // thruster trail
    if (Math.hypot(this.pvx, this.pvy) > 60) {
      const ba = Math.atan2(this.pvy, this.pvx) + Math.PI;
      this.thrust.emitParticleAt(this.px + Math.cos(ba) * 14, this.py + Math.sin(ba) * 14, 1);
    }
    // look-ahead toward aim so you can see what you're shooting at
    cam.followOffset.x = damp(cam.followOffset.x, -Math.cos(this.aim) * 90, 4, dt);
    cam.followOffset.y = damp(cam.followOffset.y, -Math.sin(this.aim) * 60, 4, dt);
  }

  fire(dt: number) {
    const S = this.stats;
    this.fireT += dt;
    const interval = 1 / S.fireRate;
    if (this.fireT < interval) return;
    this.fireT = Math.min(this.fireT - interval, interval);
    const n = S.projectiles, spread = Phaser.Math.DegToRad(S.spread);
    for (let i = 0; i < n; i++) this.shoot(this.aim + (i - (n - 1) / 2) * spread);
    for (let i = 0; i < S.rear; i++) this.shoot(this.aim + Math.PI + (i - (S.rear - 1) / 2) * spread * 1.5);
    const mx = this.px + Math.cos(this.aim) * 24, my = this.py + Math.sin(this.aim) * 24;
    this.juice.burst(mx, my, C.bullet, { count: 2, speed: 120, life: 120, scale: 0.5, angle: { min: Phaser.Math.RadToDeg(this.aim) - 30, max: Phaser.Math.RadToDeg(this.aim) + 30 } });
    sfx.play('shoot');
    this.pvx -= Math.cos(this.aim) * 25; this.pvy -= Math.sin(this.aim) * 25;
  }

  shoot(angle: number) {
    const S = this.stats;
    const b = this.bullets.get();
    const a = angle + rng.range(-0.035, 0.035);
    Object.assign(b, {
      alive: true, x: this.px + Math.cos(a) * 20, y: this.py + Math.sin(a) * 20,
      vx: Math.cos(a) * S.bulletSpeed, vy: Math.sin(a) * S.bulletSpeed, r: 6 * S.bulletSize,
      life: S.bulletLife, dmg: S.damage, pierce: S.pierce, rico: S.ricochet,
    });
    b.hit.clear();
    b.img.setVisible(true).setPosition(b.x, b.y).setRotation(a).setScale(S.bulletSize, S.bulletSize);
  }

  // ================================================================ enemies

  updateEnemies(dt: number) {
    this.hash.clear();
    this.enemies.each((e) => this.hash.insert(e));
    const px = this.px, py = this.py, over = this.run.over;
    this.tele.clear();

    this.enemies.each((e) => {
      e.t += dt; e.age += dt; e.orbitCd -= dt; e.dashHitCd -= dt;
      const def = e.def;
      const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      let tvx = ux * def.speed, tvy = uy * def.speed, steer = 3;
      if (over) { tvx = -ux * def.speed * 0.5; tvy = -uy * def.speed * 0.5; }
      else switch (e.kind) {
        case 'dart': {
          // approach -> aim (telegraph) -> dash -> recover
          if (e.state === 0) { if (d < 380 && e.age > 0.6) { e.state = 1; e.timer = 0.6; e.ax = ux; e.ay = uy; } }
          else if (e.state === 1) {
            tvx = tvy = 0; steer = 10; e.ax = ux; e.ay = uy; e.timer -= dt;
            this.tele.lineStyle(2, def.color, 0.25 + 0.5 * Math.abs(Math.sin(e.t * 30)));
            this.tele.lineBetween(e.x, e.y, e.x + e.ax * 520, e.y + e.ay * 520);
            if (e.timer <= 0) { e.state = 2; e.timer = 0.45; }
          } else if (e.state === 2) { tvx = e.ax * 720; tvy = e.ay * 720; steer = 30; e.timer -= dt; if (e.timer <= 0) { e.state = 3; e.timer = 0.7; } }
          else { tvx *= 0.25; tvy *= 0.25; e.timer -= dt; if (e.timer <= 0) e.state = 0; }
          break;
        }
        case 'spitter': {
          const want = d > 430 ? 1 : d < 300 ? -1 : 0;
          const side = Math.sin(e.t * 0.7) > 0 ? 1 : -1;
          tvx = (ux * want - uy * side * 0.6) * def.speed; tvy = (uy * want + ux * side * 0.6) * def.speed;
          e.timer -= dt;
          if (e.timer < 0.4) e.img.setScale(1 + (0.4 - e.timer) * 0.8);
          if (e.timer <= 0 && d < 750) {
            e.timer = rng.range(1.8, 2.6);
            e.img.setScale(1);
            this.enemyShoot(e.x, e.y, Math.atan2(dy, dx), 280 + this.run.wave * 6);
          }
          break;
        }
        case 'boss': this.bossAI(e, dt, ux, uy, d); return;
      }
      e.vx = damp(e.vx, tvx, steer, dt); e.vy = damp(e.vy, tvy, steer, dt);
      e.kx = damp(e.kx, 0, 6, dt); e.ky = damp(e.ky, 0, 6, dt);
      e.x = clamp(e.x + (e.vx + e.kx) * dt, e.r, ARENA - e.r);
      e.y = clamp(e.y + (e.vy + e.ky) * dt, e.r, ARENA - e.r);
    });

    // soft separation so swarms spread out and stay readable
    this.enemies.each((e) => {
      this.hash.query(e.x, e.y, e.r + 32, (o) => {
        if (o === e) return;
        const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = (e.r + o.r) * 0.9;
        if (d < min) {
          const push = (min - d) * 0.25, wE = o.def.knock / (e.def.knock + o.def.knock);
          e.x += (dx / d) * push * wE * 2; e.y += (dy / d) * push * wE * 2;
        }
      });
      const img = e.img;
      img.setPosition(e.x, e.y);
      if (e.def.spin) img.rotation += e.def.spin * 0.016;
      else img.setRotation(Math.atan2(e.vy + e.ky, e.vx + e.kx));
    });
  }

  bossAI(e: Enemy, dt: number, ux: number, uy: number, d: number) {
    e.timer -= dt;
    let speed = e.def.speed;
    if (e.state === 3) {
      // charge telegraph
      speed = 0;
      this.tele.lineStyle(6, e.def.color, 0.3 + 0.4 * Math.abs(Math.sin(e.t * 25)));
      this.tele.lineBetween(e.x, e.y, e.x + e.ax * 900, e.y + e.ay * 900);
      if (e.timer <= 0) { e.state = 4; e.timer = 0.7; sfx.play('dash', { rate: 0.5 }); this.juice.shake(0.4); }
    } else if (e.state === 4) {
      e.vx = e.ax * 780; e.vy = e.ay * 780;
      if (e.timer <= 0) { e.state = 0; e.timer = 1.4; }
    } else if (e.timer <= 0) {
      const pick = rng.int(0, 2);
      const enraged = e.hp < e.maxHp * 0.4;
      if (pick === 0) {
        const n = 16 + this.bossCount * 4 + (enraged ? 8 : 0), off = rng.range(0, TAU);
        for (let i = 0; i < n; i++) this.enemyShoot(e.x, e.y, off + (i / n) * TAU, 230);
        this.juice.ring(e.x, e.y, e.def.color, { radius: 120 });
        sfx.play('laser', { rate: 0.6 });
        e.timer = enraged ? 1.3 : 2.0;
      } else if (pick === 1) {
        for (let i = 0; i < 5 + this.bossCount; i++) {
          const a = (i / 5) * TAU;
          this.spawnEnemy('drone', e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, Math.cos(a) * 200, Math.sin(a) * 200);
        }
        sfx.play('spawn');
        e.timer = enraged ? 1.5 : 2.2;
      } else {
        e.state = 3; e.timer = 0.75; e.ax = ux; e.ay = uy;
      }
    }
    if (e.state !== 4) { e.vx = damp(e.vx, ux * speed, 2, dt); e.vy = damp(e.vy, uy * speed, 2, dt); }
    e.x = clamp(e.x + e.vx * dt, e.r, ARENA - e.r);
    e.y = clamp(e.y + e.vy * dt, e.r, ARENA - e.r);
    // boss shoves smaller enemies out of the way
    this.hash.query(e.x, e.y, e.r + 30, (o) => {
      if (o === e) return;
      const dx = o.x - e.x, dy = o.y - e.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < e.r + o.r) { o.x = e.x + (dx / dd) * (e.r + o.r); o.y = e.y + (dy / dd) * (e.r + o.r); }
    });
    void d;
  }

  enemyShoot(x: number, y: number, a: number, speed: number) {
    const b = this.ebullets.get();
    Object.assign(b, { alive: true, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 4 });
    b.img.setVisible(true).setPosition(x, y).setScale(1);
  }

  damageEnemy(e: Enemy, dmg: number, dirX: number, dirY: number, knock: number, crit = false) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.kx += dirX * knock * e.def.knock; e.ky += dirY * knock * e.def.knock;
    this.juice.flash(e.img, 50);
    if (this.pops < 45) {
      this.pops++;
      const t = this.juice.pop(e.x + rng.range(-8, 8), e.y - e.r, crit ? `${Math.round(dmg)}!` : `${Math.round(dmg * 10) / 10}`, {
        size: crit ? 22 : 13, color: crit ? '#ffe14d' : '#ffffff', rise: crit ? 50 : 28, ms: crit ? 700 : 420,
      });
      t.once('destroy', () => this.pops--);
    }
    if (e.hp <= 0) this.killEnemy(e);
    else sfx.play('hit', { volume: 0.5 });
  }

  killEnemy(e: Enemy) {
    e.alive = false;
    e.img.setVisible(false);
    this.tweens.killTweensOf(e.img);
    const def = e.def, R = this.run, big = e.r >= 28;
    this.juice.burst(e.x, e.y, def.color, { count: 10 + e.r, speed: 200 + e.r * 8, life: 450 + e.r * 8, scale: 0.7 + e.r / 40 });
    this.juice.burst(e.x, e.y, 0xffffff, { count: 4, speed: 140, life: 200, scale: 0.6 });
    if (big) { this.juice.ring(e.x, e.y, def.color, { radius: e.r * 2.5 }); this.juice.shake(e.kind === 'boss' ? 1 : 0.35); this.juice.hitstop(e.kind === 'boss' ? 160 : 45); }
    else this.juice.shake(0.08, 80);
    sfx.play(big ? 'bigBoom' : 'explode', { volume: big ? 0.8 : 0.45 });

    R.kills++;
    R.combo++; R.bestCombo = Math.max(R.bestCombo, R.combo);
    R.mult = Math.min(10, 1 + Math.floor(R.combo / 12));
    this.comboT = 1.8;
    R.score += Math.round(def.score * R.mult);

    // drops
    let xp = def.xp;
    while (xp > 0) { const v = xp >= 5 ? 5 : 1; this.dropGem('xp', e.x + rng.range(-e.r, e.r), e.y + rng.range(-e.r, e.r), v); xp -= v; }
    if (rng.chance(R.hp < R.maxHp ? 0.012 : 0.004)) this.dropGem('heart', e.x, e.y, 1);
    if (rng.chance(0.004)) this.dropGem('vacuum', e.x, e.y, 1);

    if (e.kind === 'splitter') for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rng.range(0, 1);
      this.spawnEnemy('mini', e.x, e.y, Math.cos(a) * 320, Math.sin(a) * 320).img.setScale(1);
    }
    if (this.stats.volatile > 0 && e.kind !== 'mini') {
      const L = this.stats.volatile;
      this.booms.push({ x: e.x, y: e.y, r: 55 + L * 16 + e.r, dmg: (0.8 + L * 0.9) * this.stats.damage, t: 0.07 });
    }
    if (e === this.boss) this.bossDown(e);
  }

  bossDown(e: Enemy) {
    this.boss = null;
    this.juice.slowmo(0.2, 900);
    this.juice.zoomPunch(1.12, 600);
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 90, () => this.juice.ring(e.x, e.y, [0xff2255, 0xffe14d, 0xffffff][i % 3], { radius: 180 + i * 70, ms: 600, width: 8 }));
    this.gems.each((g) => (g.pulled = true));
    this.heal(2);
    this.run.score += 2500 * this.bossCount;
    this.events.emit('banner', 'HIVE DESTROYED', `+${2500 * this.bossCount}`, 0xffe14d);
    sfx.notes('select', [0, 4, 7, 12, 16], 0.08);
    // clear the field a little
    this.ebullets.each((b) => { b.alive = false; b.img.setVisible(false); });
  }

  updateBooms(dt: number) {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.booms.splice(i, 1);
      this.juice.ring(b.x, b.y, 0xff8a2a, { radius: b.r, ms: 280, width: 5 });
      this.juice.burst(b.x, b.y, 0xffb04d, { count: 10, speed: b.r * 3, life: 300 });
      sfx.play('thud', { volume: 0.6 });
      this.hash.query(b.x, b.y, b.r + 30, (o) => {
        if (!o.alive) return;
        const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1;
        if (d < b.r + o.r) this.damageEnemy(o, b.dmg, dx / d, dy / d, 260);
      });
    }
  }

  // ================================================================ bullets

  updateBullets(dt: number) {
    this.bullets.each((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > ARENA || b.y > ARENA) {
        if (b.life > 0) this.juice.burst(b.x, b.y, C.bullet, { count: 3, speed: 100, life: 150, scale: 0.4 });
        b.alive = false; b.img.setVisible(false); return;
      }
      let target: Enemy | null = null;
      this.hash.query(b.x, b.y, b.r + 70, (e, d2) => {
        if (target || !e.alive || b.hit.has(e)) return;
        if (d2 < (b.r + e.r) ** 2) target = e;
      });
      if (target) this.bulletHit(b, target);
      if (b.alive) b.img.setPosition(b.x, b.y);
    });
  }

  bulletHit(b: Bullet, e: Enemy) {
    const S = this.stats;
    b.hit.add(e);
    const crit = rng.chance(S.crit);
    const sp = Math.hypot(b.vx, b.vy);
    this.damageEnemy(e, b.dmg * (crit ? S.critMult : 1), b.vx / sp, b.vy / sp, 150, crit);
    this.juice.burst(b.x, b.y, crit ? C.crit : C.bullet, { count: crit ? 8 : 4, speed: 180, life: 180, scale: 0.5 });
    if (b.rico > 0) {
      const next = this.hash.nearest(b.x, b.y, 340, (o) => o.alive && !b.hit.has(o));
      if (next) {
        b.rico--;
        const a = Math.atan2(next.y - b.y, next.x - b.x);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        b.life = Math.max(b.life, 0.45);
        b.img.setRotation(a);
        return;
      }
    }
    if (b.pierce > 0) { b.pierce--; return; }
    b.alive = false; b.img.setVisible(false);
  }

  updateEnemyBullets(dt: number) {
    this.ebullets.each((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -50 || b.y < -50 || b.x > ARENA + 50 || b.y > ARENA + 50) { b.alive = false; b.img.setVisible(false); return; }
      b.img.setPosition(b.x, b.y).setScale(1 + Math.sin(b.life * 20) * 0.15);
      if (!this.run.over && Math.hypot(b.x - this.px, b.y - this.py) < b.r + PLAYER.radius - 3) {
        b.alive = false; b.img.setVisible(false);
        this.hurt();
      }
    });
  }

  // ================================================================ abilities

  updateOrbitals(dt: number) {
    const n = this.stats.orbitals;
    while (this.orbitals.length < n) this.orbitals.push(this.add.image(0, 0, 'orbital').setTint(C.orbital).setBlendMode('ADD').setDepth(31));
    if (!n) return;
    this.orbitA += dt * (2.6 + n * 0.15);
    const rad = 78 + n * 4, dmg = 2 + this.stats.damage * 1.5;
    this.orbitals.forEach((o, i) => {
      const a = this.orbitA + (i / n) * TAU;
      const x = this.px + Math.cos(a) * rad, y = this.py + Math.sin(a) * rad;
      o.setPosition(x, y).setRotation(a * 2);
      this.hash.query(x, y, 50, (e, d2) => {
        if (e.alive && e.orbitCd <= 0 && d2 < (12 + e.r) ** 2) {
          e.orbitCd = 0.3;
          this.damageEnemy(e, dmg, Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2), 220);
          this.juice.burst(x, y, C.orbital, { count: 4, speed: 150, life: 160, scale: 0.5 });
        }
      });
    });
  }

  updateNova(dt: number) {
    const L = this.stats.nova;
    if (!L) return;
    this.novaT += dt;
    const every = Math.max(2.2, 7.5 - L * 1.2);
    if (this.novaT < every) return;
    this.novaT = 0;
    const R = 230 + L * 25, dmg = (2 + L * 1.5) * this.stats.damage;
    this.juice.ring(this.px, this.py, C.nova, { radius: R, ms: 420, width: 10 });
    this.juice.ring(this.px, this.py, 0xffffff, { radius: R * 0.7, ms: 300, width: 3 });
    this.juice.shake(0.25);
    sfx.play('shockwave');
    this.hash.query(this.px, this.py, R + 30, (e) => {
      const dx = e.x - this.px, dy = e.y - this.py, d = Math.hypot(dx, dy) || 1;
      if (e.alive && d < R + e.r) this.damageEnemy(e, dmg, dx / d, dy / d, 650);
    });
    this.ebullets.each((b) => { if (Math.hypot(b.x - this.px, b.y - this.py) < R) { b.alive = false; b.img.setVisible(false); } });
  }

  // ================================================================ pickups

  dropGem(kind: GemKind, x: number, y: number, value: number) {
    if (kind === 'xp' && this.gems.count() > 350) {
      // too many on the floor: merge into an existing gem instead
      for (const g of this.gems.alive()) if (g.kind === 'xp') { g.value += value; g.img.setScale(Math.min(2, 1 + g.value * 0.05)); return; }
    }
    const g = this.gems.get();
    const a = rng.range(0, TAU), s = rng.range(40, 140);
    Object.assign(g, { alive: true, kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value, pulled: false, age: 0 });
    const tex = kind === 'xp' ? 'gem' : kind;
    const tint = kind === 'xp' ? (value >= 5 ? 0x66e0ff : C.xp) : kind === 'heart' ? C.heart : C.vacuum;
    g.img.setTexture(tex).setTint(tint).setVisible(true).setPosition(x, y).setScale(kind === 'xp' ? (value >= 5 ? 1.5 : 1) : 1).setAlpha(1);
  }

  updateGems(dt: number) {
    const mag = this.stats.magnet;
    this.gems.each((g) => {
      g.age += dt;
      const dx = this.px - g.x, dy = this.py - g.y, d = Math.hypot(dx, dy) || 1;
      if (!this.run.over && (g.pulled || d < mag)) {
        g.pulled = true;
        const pull = 900 + g.age * 60;
        g.vx = damp(g.vx, (dx / d) * pull, 6, dt); g.vy = damp(g.vy, (dy / d) * pull, 6, dt);
      } else { g.vx = damp(g.vx, 0, 4, dt); g.vy = damp(g.vy, 0, 4, dt); }
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.img.setPosition(g.x, g.y).setRotation(g.kind === 'xp' ? 0 : g.age * 2);
      if (g.kind !== 'xp') g.img.setScale(1 + Math.sin(g.age * 6) * 0.15);
      if (!this.run.over && d < PLAYER.radius + 12) this.collect(g);
      else if (!g.pulled && g.age > 25) { g.img.setAlpha(Math.floor(g.age * 8) % 2 ? 0.3 : 1); if (g.age > 30) { g.alive = false; g.img.setVisible(false); } }
    });
  }

  collect(g: Gem) {
    g.alive = false; g.img.setVisible(false);
    const R = this.run;
    if (g.kind === 'heart') {
      if (R.hp < R.maxHp) this.heal(1); else { R.score += 250; this.juice.pop(this.px, this.py - 30, '+250', { color: '#ff3366' }); }
      sfx.play('coin');
      return;
    }
    if (g.kind === 'vacuum') {
      this.gems.each((o) => (o.pulled = true));
      this.juice.ring(this.px, this.py, C.vacuum, { radius: 400, ms: 500, width: 6 });
      this.events.emit('toast', 'VACUUM!');
      sfx.play('powerup');
      return;
    }
    R.xp += g.value;
    this.pickupChain = Math.min(this.pickupChain + 1, 24); this.pickupT = 0.35;
    sfx.play('pickup', { freq: 900 * 2 ** (this.pickupChain / 12), volume: 0.5 });
    while (R.xp >= R.xpNext) {
      R.xp -= R.xpNext; R.level++; R.xpNext = xpForLevel(R.level);
      this.pendingLevels++;
    }
  }

  heal(n: number) {
    const R = this.run;
    const before = R.hp;
    R.hp = Math.min(R.maxHp, R.hp + n);
    if (R.hp > before) { this.juice.pop(this.px, this.py - 34, `+${R.hp - before} HP`, { color: '#ff3366', size: 20 }); this.juice.ring(this.px, this.py, C.heart, { radius: 70 }); }
  }

  // ================================================================ damage / death

  contact() {
    if (this.invuln > 0 && !(this.dashT > 0 && this.stats.dashDamage > 0)) return;
    this.hash.query(this.px, this.py, PLAYER.radius + 70, (e, d2) => {
      if (!e.alive || e.age < 0.3) return;
      const rr = PLAYER.radius + e.r * 0.8;
      if (d2 > rr * rr) return;
      if (this.dashT > 0 && this.stats.dashDamage > 0) {
        if (e.dashHitCd <= 0) { e.dashHitCd = 0.4; this.damageEnemy(e, this.stats.dashDamage * this.stats.damage, this.dashDx, this.dashDy, 400); }
        return;
      }
      if (this.invuln <= 0) this.hurt();
    });
  }

  hurt() {
    const R = this.run;
    if (this.invuln > 0 || R.over) return;
    if (this.q.has('god')) { this.invuln = 0.5; return; }
    R.hp--;
    R.combo = 0; R.mult = 1;
    this.invuln = PLAYER.iframes;
    sfx.play('hurt'); music.duck(0.3, 400);
    this.juice.shake(0.9, 260);
    this.juice.hitstop(90);
    this.juice.screenFlash(0xff2244, 0.4, 250);
    this.juice.burst(this.px, this.py, C.heart, { count: 24, speed: 380 });
    this.events.emit('hurt');
    // knock nearby enemies back so you get a breather
    this.hash.query(this.px, this.py, 200, (e) => {
      const dx = e.x - this.px, dy = e.y - this.py, d = Math.hypot(dx, dy) || 1;
      e.kx += (dx / d) * 700 * e.def.knock; e.ky += (dy / d) * 700 * e.def.knock;
    });
    this.juice.ring(this.px, this.py, C.heart, { radius: 200, ms: 350, width: 6 });
    this.ebullets.each((b) => { if (Math.hypot(b.x - this.px, b.y - this.py) < 220) { b.alive = false; b.img.setVisible(false); } });
    if (R.hp <= 0) this.die();
  }

  die() {
    const R = this.run;
    R.over = true;
    this.player.setVisible(false);
    (this.children.getByName('pglow') as Img).setVisible(false);
    this.orbitals.forEach((o) => o.setVisible(false));
    this.juice.burst(this.px, this.py, C.player, { count: 60, speed: 600, life: 1200, scale: 1.4 });
    this.juice.burst(this.px, this.py, 0xffffff, { count: 30, speed: 300, life: 800 });
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 120, () => this.juice.ring(this.px, this.py, C.player, { radius: 150 + i * 90, ms: 700, width: 6 }));
    sfx.play('bigBoom'); voice('game_over');
    music.setIntensity(0);
    this.juice.slowmo(0.25, 1200);
    this.cameras.main.stopFollow();
    this.time.delayedCall(500, () => {
      this.scene.stop('Hud');
      this.scene.launch('GameOver', { ...R, upgrades: { ...R.upgrades } });
    });
  }

  // ================================================================ level up

  openLevelUp() {
    this.levelUpOpen = true;
    const owned = this.run.upgrades;
    const avail = UPGRADES.filter((u) => (owned[u.id] ?? 0) < u.max);
    const picks: string[] = [];
    while (picks.length < 3 && picks.length < avail.length) {
      const id = rng.weighted(avail.filter((u) => !picks.includes(u.id)).map((u) => [u.id, u.weight] as const));
      picks.push(id);
    }
    sfx.notes('blip', [0, 4, 7, 12], 0.06); voice('level_up');
    this.juice.ring(this.px, this.py, C.xp, { radius: 160, ms: 400, width: 6 });
    this.scene.pause();
    this.scene.launch('LevelUp', { choices: picks, level: this.run.level, owned: { ...owned } });
  }

  applyUpgrade(id: string) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return;
    u.apply(this.stats);
    const R = this.run;
    R.upgrades[id] = (R.upgrades[id] ?? 0) + 1;
    R.maxHp = this.stats.maxHp;
    if (id === 'hp') this.heal(2);
    this.pendingLevels--;
    this.levelUpOpen = false;
    this.scene.resume();
    this.invuln = Math.max(this.invuln, 0.8);
    this.juice.zoomPunch(1.06, 300);
    this.juice.ring(this.px, this.py, u.color, { radius: 120, ms: 400, width: 6 });
    sfx.play('powerup');
  }
}
