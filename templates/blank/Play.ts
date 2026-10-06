/**
 * The whole game lives here. Replace freely — the kit handles menus, pause, game over, best score.
 * Starter loop: grab gold dots, dodge red hazards, survive the timer.
 */
import Phaser from 'phaser';
import { Juice } from '@kit/phaser/juice';
import { neon, dot, grid } from '@kit/phaser/textures';
import { text, clock } from '@kit/phaser/ui';
import { enablePause } from '@kit/phaser/scenes';
import { TouchPad } from '@kit/phaser/touch';
import { playtest } from '@kit/phaser/boot';
import { tune } from '@kit/tune';
import { sfx, music } from '@kit/audio';
import { damp, clamp } from '@kit/math';
import { rng } from '@kit/rng';
import { PLAYER, GAME, COLORS, W, H } from './config';

export function makeArt(scene: Phaser.Scene) {
  if (scene.textures.exists('player')) return;
  neon(scene, 'player', 'square', 30, { fill: 0.3 });
  neon(scene, 'dot', 'gem', 18, { fill: 0.6 });
  neon(scene, 'hazard', 'circle', 26, { core: true });
  dot(scene, 'spark', 8);
  grid(scene, 'grid', 64, 0x1b2550);
}
tune(PLAYER, 'Player');
tune(GAME, 'Game');

const q = new URLSearchParams(location.search);

export class Play extends Phaser.Scene {
  constructor() { super('Play'); }
  juice!: Juice;
  pad!: TouchPad;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  player!: Phaser.GameObjects.Image;
  vx = 0; vy = 0;
  dots: Phaser.GameObjects.Image[] = [];
  hazards: { img: Phaser.GameObjects.Image; vx: number; vy: number }[] = [];
  score = 0; left = 0; hazardT = 0; over = false;
  hud!: Phaser.GameObjects.Text;

  create() {
    makeArt(this);
    this.juice = new Juice(this);
    this.pad = new TouchPad(this);
    enablePause(this);
    Object.assign(this, { vx: 0, vy: 0, dots: [], hazards: [], score: 0, left: GAME.roundTime, hazardT: 1, over: false });
    this.add.tileSprite(0, 0, W, H, 'grid').setOrigin(0).setAlpha(0.4);
    this.player = this.add.image(W / 2, H / 2, 'player').setTint(COLORS.player).setBlendMode('ADD');
    for (let i = 0; i < GAME.dotsOnScreen; i++) this.spawnDot();
    this.hud = text(this, 20, 20, '', { size: 22, origin: [0, 0] }).setDepth(10);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    music.setIntensity(1);
    this.cameras.main.fadeIn(250);
  }

  spawnDot() {
    const d = this.add.image(rng.range(60, W - 60), rng.range(80, H - 60), 'dot').setTint(COLORS.dot).setBlendMode('ADD').setScale(0);
    this.tweens.add({ targets: d, scale: 1, duration: 250, ease: 'Back.Out' });
    this.dots.push(d);
  }

  spawnHazard() {
    const side = rng.int(0, 3), sp = GAME.hazardSpeed + (GAME.roundTime - this.left) * GAME.hazardSpeedPerSec;
    const x = side === 0 ? -20 : side === 1 ? W + 20 : rng.range(0, W), y = side === 2 ? -20 : side === 3 ? H + 20 : rng.range(0, H);
    const a = Math.atan2(this.player.y - y, this.player.x - x) + rng.range(-0.4, 0.4);
    this.hazards.push({ img: this.add.image(x, y, 'hazard').setTint(COLORS.hazard).setBlendMode('ADD'), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
  }

  update(_t: number, ms: number) {
    const dt = Math.min(ms / 1000, 1 / 20) * this.juice.timeScale;
    if (dt <= 0 || this.over) return;
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + this.pad.x;
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + this.pad.y;
    const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
    this.vx = damp(this.vx, ix * PLAYER.speed, PLAYER.accel, dt);
    this.vy = damp(this.vy, iy * PLAYER.speed, PLAYER.accel, dt);
    const p = this.player;
    p.x = clamp(p.x + this.vx * dt, 20, W - 20); p.y = clamp(p.y + this.vy * dt, 20, H - 20);
    p.rotation += dt * (2 + Math.hypot(this.vx, this.vy) / 80);

    for (const d of [...this.dots]) if (Phaser.Math.Distance.Between(p.x, p.y, d.x, d.y) < PLAYER.radius + 12) {
      this.dots.splice(this.dots.indexOf(d), 1); d.destroy();
      this.score += 10;
      sfx.play('coin');
      this.juice.burst(d.x, d.y, COLORS.dot, { count: 14, speed: 220 });
      this.juice.pop(d.x, d.y - 16, '+10', { color: '#ffe14d' });
      this.juice.squash(p, 1.3, 1.3, 120);
      this.spawnDot();
    }
    this.hazardT -= dt;
    if (this.hazardT <= 0) { this.hazardT = GAME.hazardEvery * (0.5 + 0.5 * this.left / GAME.roundTime); this.spawnHazard(); }
    for (const h of [...this.hazards]) {
      h.img.x += h.vx * dt; h.img.y += h.vy * dt; h.img.rotation += dt * 3;
      if (h.img.x < -60 || h.img.x > W + 60 || h.img.y < -60 || h.img.y > H + 60) { h.img.destroy(); this.hazards.splice(this.hazards.indexOf(h), 1); continue; }
      if (!q.has('god') && Phaser.Math.Distance.Between(p.x, p.y, h.img.x, h.img.y) < PLAYER.radius + 11) return this.end(false);
    }
    this.left -= dt;
    if (this.left <= 0) return this.end(true);
    this.hud.setText(`${this.score}    ${clock(this.left)}`);
    playtest({ score: this.score, left: Math.ceil(this.left), hazards: this.hazards.length });
    this.pad.endFrame();
  }

  end(won: boolean) {
    this.over = true;
    if (won) sfx.notes('select', [0, 4, 7, 12], 0.08);
    else { sfx.play('hurt'); this.juice.shake(0.8, 300); this.juice.burst(this.player.x, this.player.y, COLORS.player, { count: 40, speed: 400 }); this.player.setVisible(false); }
    this.time.delayedCall(won ? 400 : 900, () => this.scene.start('GameOver', { won, title: won ? 'SURVIVED!' : 'GAME OVER', score: this.score, stats: [['TIME', clock(GAME.roundTime - Math.max(0, this.left))]] }));
  }
}
