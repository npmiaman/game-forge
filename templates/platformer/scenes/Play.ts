import Phaser from 'phaser';
import { Juice } from '@kit/phaser/juice';
import { text, FONTS } from '@kit/phaser/ui';
import { sfx, music, SONGS } from '@kit/audio';
import { playtest } from '@kit/phaser/boot';
import { enablePause } from '@kit/phaser/scenes';
import { buildLevel } from '@kit/phaser/level';
import { TouchPad } from '@kit/phaser/touch';
import { tune } from '@kit/tune';
import { makeArt } from '../art';
import { LEVEL, PLAYER, TILE, H } from '../config';

tune(PLAYER, 'Player');
const q = new URLSearchParams(location.search);

type Sprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

export class Play extends Phaser.Scene {
  constructor() { super('Play'); }

  juice!: Juice;
  pad!: TouchPad;
  player!: Sprite;
  solids!: Phaser.Physics.Arcade.StaticGroup;
  coins!: Phaser.Physics.Arcade.StaticGroup;
  hazards!: Phaser.Physics.Arcade.StaticGroup;
  enemies!: Phaser.Physics.Arcade.Group;
  flag!: Phaser.Types.Physics.Arcade.ImageWithStaticBody;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  hud!: Phaser.GameObjects.Text;
  dust!: Phaser.GameObjects.Particles.ParticleEmitter;

  spawn = { x: 0, y: 0 };
  score = 0; lives = PLAYER.lives; elapsed = 0; totalCoins = 0;
  coyote = 0; buffer = 0; wasGrounded = false; dead = false; won = false;

  create() {
    makeArt(this);
    this.juice = new Juice(this);
    this.pad = new TouchPad(this, { buttons: ['JUMP'] });
    enablePause(this);
    Object.assign(this, { score: 0, lives: PLAYER.lives, elapsed: 0, totalCoins: 0, coyote: 0, buffer: 0, dead: false, won: false });

    const worldW = Math.max(...LEVEL.map((r) => r.length)) * TILE, worldH = LEVEL.length * TILE;
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0);
    // parallax hills
    for (let i = 0; i < 2; i++) {
      const g = this.add.graphics().setScrollFactor(0.2 + i * 0.25);
      g.fillStyle(i ? 0x2a1f4f : 0x221a42, 1);
      for (let x = -200; x < worldW; x += 260 - i * 60) g.fillCircle(x, H - 40 + i * 30, 160 - i * 40);
    }

    this.solids = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.hazards = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();

    buildLevel(LEVEL, TILE, {
      '#': (x, y, tx, ty, g) => this.solids.create(x, y, g.get(tx, ty - 1) === '#' ? 'ground' : 'ground-top'),
      'c': (x, y) => { this.coins.create(x, y, 'coin').play('coin-spin').setCircle(10, 6, 6); this.totalCoins++; },
      '^': (x, y) => this.hazards.create(x, y, 'spike').setSize(TILE - 8, TILE / 2).setOffset(4, TILE / 2),
      'E': (x, y) => this.enemies.create(x, y, 'slime').play('slime-move').setVelocityX(-70).setBounceX(1).setSize(26, 20).setOffset(3, 12),
      'P': (x, y) => (this.spawn = { x, y }),
      'F': (x, y) => (this.flag = this.physics.add.staticImage(x, y, 'flag')),
    });

    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, 'hero', 0);
    this.player.body.setSize(20, 28).setOffset(6, 4);
    this.player.body.setMaxVelocityY(PLAYER.maxFall);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, worldW, worldH + 200);
    this.physics.world.setBoundsCollision(true, true, true, false); // fall out the bottom

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collect(c as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.hazards, () => this.hurt());
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touchEnemy(e as Phaser.Physics.Arcade.Sprite));
    if (this.flag) this.physics.add.overlap(this.player, this.flag, () => this.win());

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setDeadzone(80, 60);
    cam.fadeIn(300);

    this.dust = this.add.particles(0, 0, 'puff', { emitting: false, speed: { min: 20, max: 80 }, angle: { min: 200, max: 340 }, lifespan: 350, scale: { start: 0.9, end: 0 }, alpha: { start: 0.7, end: 0 }, gravityY: -100 });

    this.hud = text(this, 16, 14, '', { size: 14, font: FONTS.pixel, origin: [0, 0], stroke: '#000', strokeWidth: 4 }).setScrollFactor(0).setDepth(100);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    for (const k of ['SPACE', 'UP', 'W']) kb.on(`keydown-${k}`, () => (this.buffer = PLAYER.jumpBuffer));

    if (!music.playing) music.play(SONGS.chiptune);
    music.setIntensity(1);
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 20) * this.juice.timeScale;
    if (dt <= 0 || this.dead || this.won) return;
    this.elapsed += dt;
    const p = this.player, body = p.body, k = this.keys;
    const grounded = body.blocked.down;

    // horizontal: accelerate toward target speed, snappy friction when no input
    const dir = Math.sign((k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0) + Math.round(this.pad.x));
    if (this.pad.pressed('JUMP')) this.buffer = PLAYER.jumpBuffer;
    const accel = dir ? (grounded ? PLAYER.accelGround : PLAYER.accelAir) : PLAYER.friction;
    const target = dir * PLAYER.runSpeed;
    const vx = body.velocity.x;
    body.setVelocityX(vx < target ? Math.min(vx + accel * dt, target) : Math.max(vx - accel * dt, target));
    if (dir) p.setFlipX(dir < 0);

    // jump with coyote time + input buffer + variable height
    this.coyote = grounded ? PLAYER.coyoteTime : this.coyote - dt;
    this.buffer -= dt;
    if (this.buffer > 0 && this.coyote > 0) {
      body.setVelocityY(-PLAYER.jumpVelocity);
      this.buffer = 0; this.coyote = 0;
      this.juice.squash(p, 0.7, 1.3);
      this.dust.explode(6, p.x, p.y + 14);
      sfx.play('jump');
    }
    const jumpHeld = k.SPACE.isDown || k.UP.isDown || k.W.isDown || this.pad.down('JUMP');
    if (!jumpHeld && body.velocity.y < 0) body.setVelocityY(body.velocity.y * Math.pow(PLAYER.jumpCut, dt * 20));

    // landing
    if (grounded && !this.wasGrounded) {
      this.juice.squash(p, 1.3, 0.7);
      this.dust.explode(8, p.x, p.y + 14);
      sfx.play('thud', { volume: 0.3 });
    }
    this.wasGrounded = grounded;

    // animation
    if (!grounded) p.anims.stop(), p.setFrame(3);
    else if (Math.abs(body.velocity.x) > 20) p.anims.play('hero-run', true);
    else p.anims.stop(), p.setFrame(0);

    // slimes turn around at walls
    for (const o of this.enemies.getChildren()) {
      const e = o as Phaser.Physics.Arcade.Sprite, b = e.body as Phaser.Physics.Arcade.Body;
      if (!e.active) continue;
      if (b.blocked.left) e.setVelocityX(70); else if (b.blocked.right) e.setVelocityX(-70);
      e.setFlipX(b.velocity.x > 0);
    }

    if (p.y > this.physics.world.bounds.height - 150) this.hurt();
    this.hud.setText(`♥ ${this.lives}   ◎ ${this.score}/${this.totalCoins}   ${this.elapsed.toFixed(1)}s`);
    playtest({ x: Math.round(p.x), coins: this.score, lives: this.lives, time: Math.round(this.elapsed) });
    this.pad.endFrame();
  }

  collect(c: Phaser.Physics.Arcade.Sprite) {
    c.disableBody(true, true);
    this.score++;
    sfx.play('coin');
    this.juice.burst(c.x, c.y, 0xffd23f, { count: 10, speed: 160, life: 350, scale: 0.6 });
    this.juice.pop(c.x, c.y - 10, '+1', { color: '#ffd23f', size: 14, font: FONTS.pixel });
  }

  touchEnemy(e: Phaser.Physics.Arcade.Sprite) {
    const pb = this.player.body;
    if (pb.velocity.y > 0 && this.player.y < e.y - 8) {
      // stomp!
      e.disableBody(true, true);
      pb.setVelocityY(-PLAYER.jumpVelocity * 0.7);
      this.juice.hitstop(60);
      this.juice.shake(0.3);
      this.juice.burst(e.x, e.y, 0x7dff6b, { count: 16, speed: 220 });
      sfx.play('explode', { volume: 0.5 });
    } else this.hurt();
  }

  hurt() {
    if (this.dead || q.has('god')) return;
    this.dead = true;
    this.lives--;
    sfx.play('hurt');
    this.juice.shake(0.7, 250);
    this.juice.hitstop(100);
    this.juice.burst(this.player.x, this.player.y, 0x66e0ff, { count: 24, speed: 300 });
    this.player.setVisible(false).body.enable = false;
    this.time.delayedCall(700, () => {
      if (this.lives <= 0) { this.scene.start('GameOver', { won: false, stats: [['COINS', `${this.score}/${this.totalCoins}`], ['TIME', `${this.elapsed.toFixed(1)}s`]] }); return; }
      this.player.setPosition(this.spawn.x, this.spawn.y).setVelocity(0, 0).setVisible(true).body.enable = true;
      this.dead = false;
    });
  }

  win() {
    if (this.won) return;
    this.won = true;
    this.player.body.setVelocity(0, -300);
    sfx.notes('select', [0, 4, 7, 12, 16], 0.09);
    this.juice.zoomPunch(1.1, 500);
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 120, () => this.juice.burst(this.flag.x, this.flag.y - 20, [0xffd23f, 0x66e0ff, 0xff4d6d][i % 3], { count: 20, speed: 350, gravityY: 400 }));
    this.time.delayedCall(1200, () => this.scene.start('GameOver', { won: true, coins: this.score, total: this.totalCoins, time: this.time }));
  }
}
