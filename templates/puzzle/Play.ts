/**
 * Grid puzzle starter (Sokoban). Patterns: game state as a Grid, every move pushes a snapshot
 * (so undo is trivial), sprites tween to match state, level index passed via scene data.
 */
import Phaser from 'phaser';
import { Juice } from '@kit/phaser/juice';
import { neon, dot } from '@kit/phaser/textures';
import { text } from '@kit/phaser/ui';
import { enablePause } from '@kit/phaser/scenes';
import { playtest } from '@kit/phaser/boot';
import { Grid, type P } from '@kit/grid';
import { store } from '@kit/save';
import { sfx, music } from '@kit/audio';
import { LEVELS, COLORS, MOVE_MS, SLUG, W, H } from './config';

export function makeArt(s: Phaser.Scene) {
  if (s.textures.exists('box')) return;
  neon(s, 'wall', 'square', 40, { fill: 0.15, glow: 4 });
  neon(s, 'goal', 'diamond', 22, { fill: 0.4 });
  neon(s, 'box', 'square', 34, { fill: 0.35 });
  neon(s, 'hero', 'circle', 30, { core: true });
  dot(s, 'spark', 8);
}
const save = store(SLUG, { best: 0, runs: 0 });

type State = { player: P; boxes: P[] };

export class Play extends Phaser.Scene {
  constructor() { super('Play'); }
  juice!: Juice;
  level = 0; moves = 0; tile = 56; ox = 0; oy = 0; busy = false;
  walls!: Grid<boolean>; goals: P[] = [];
  state!: State; history: State[] = [];
  hero!: Phaser.GameObjects.Image; boxes: Phaser.GameObjects.Image[] = [];
  hud!: Phaser.GameObjects.Text;

  create(data: { level?: number }) {
    makeArt(this);
    this.juice = new Juice(this);
    enablePause(this, { hint: 'Z undo · R restart' });
    this.level = data?.level ?? Number(new URLSearchParams(location.search).get('level') ?? 0);
    this.moves = 0; this.history = []; this.busy = false;

    const g = Grid.fromAscii(LEVELS[this.level]);
    this.tile = Math.min(64, Math.floor(Math.min((W - 80) / g.w, (H - 160) / g.h)));
    this.ox = (W - g.w * this.tile) / 2 + this.tile / 2;
    this.oy = (H - g.h * this.tile) / 2 + this.tile / 2 + 30;
    this.walls = new Grid(g.w, g.h, (x, y) => g.get(x, y) === '#');
    this.goals = g.findAll((c) => c === '.' || c === '*' || c === '+');
    this.state = { player: g.find((c) => c === '@' || c === '+')!, boxes: g.findAll((c) => c === '$' || c === '*') };

    const s = this.tile / 40;
    const inside = g.flood(this.state.player, (c) => c !== '#');   // floor = cells reachable from the player
    g.forEach((c, x, y) => {
      const [px, py] = this.pos({ x, y });
      if (c === '#') this.add.image(px, py, 'wall').setTint(COLORS.wall).setScale(s * 1.05).setAlpha(0.8);
      else if (inside.get(x, y)! >= 0) this.add.rectangle(px, py, this.tile - 2, this.tile - 2, COLORS.floor);
    });
    for (const p of this.goals) this.add.image(...this.pos(p), 'goal').setTint(COLORS.goal).setScale(s).setBlendMode('ADD');
    this.boxes = this.state.boxes.map((b) => this.add.image(...this.pos(b), 'box').setTint(COLORS.box).setScale(s).setBlendMode('ADD'));
    this.hero = this.add.image(...this.pos(this.state.player), 'hero').setTint(COLORS.player).setScale(s).setBlendMode('ADD');
    this.refreshBoxes(false);

    text(this, W / 2, 40, `LEVEL ${this.level + 1} / ${LEVELS.length}`, { size: 26, color: '#5dffa0' });
    this.hud = text(this, W / 2, 76, '', { size: 14, color: '#8899cc' });

    const kb = this.input.keyboard!;
    const dirs: Record<string, P> = { LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 }, UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, A: { x: -1, y: 0 }, D: { x: 1, y: 0 }, W: { x: 0, y: -1 }, S: { x: 0, y: 1 } };
    for (const [k, d] of Object.entries(dirs)) kb.on(`keydown-${k}`, () => this.move(d));
    kb.on('keydown-Z', () => this.undo());
    kb.on('keydown-R', () => this.scene.restart({ level: this.level }));
    // swipe to move on touch
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dx = p.upX - p.downX, dy = p.upY - p.downY;
      if (Math.hypot(dx, dy) > 30) this.move(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    });
    music.setIntensity(0);
    this.cameras.main.fadeIn(200);
    this.updateHud();
  }

  pos(p: P): [number, number] { return [this.ox + p.x * this.tile, this.oy + p.y * this.tile]; }
  boxAt(x: number, y: number) { return this.state.boxes.findIndex((b) => b.x === x && b.y === y); }
  isGoal(p: P) { return this.goals.some((g) => g.x === p.x && g.y === p.y); }

  move(d: P) {
    if (this.busy) return;
    const { player } = this.state, nx = player.x + d.x, ny = player.y + d.y;
    if (this.walls.get(nx, ny) !== false) return this.bump(d);
    const bi = this.boxAt(nx, ny);
    if (bi >= 0) {
      const bx = nx + d.x, by = ny + d.y;
      if (this.walls.get(bx, by) !== false || this.boxAt(bx, by) >= 0) return this.bump(d);
      this.history.push(structuredClone(this.state));
      this.state.boxes[bi] = { x: bx, y: by };
      sfx.play('thud', { volume: 0.5 });
    } else this.history.push(structuredClone(this.state));
    this.state.player = { x: nx, y: ny };
    this.moves++;
    sfx.play('blip', { volume: 0.4 });
    this.sync();
  }

  bump(d: P) {
    sfx.play('denied', { volume: 0.4 });
    this.tweens.add({ targets: this.hero, x: this.hero.x + d.x * 6, y: this.hero.y + d.y * 6, duration: 50, yoyo: true });
  }

  undo() {
    const prev = this.history.pop();
    if (!prev || this.busy) return;
    this.state = prev; this.moves = Math.max(0, this.moves - 1);
    sfx.play('blip', { rate: 0.7 });
    this.sync();
  }

  sync() {
    this.busy = true;
    const [hx, hy] = this.pos(this.state.player);
    this.tweens.add({ targets: this.hero, x: hx, y: hy, duration: MOVE_MS, ease: 'Quad.Out', onComplete: () => (this.busy = false) });
    this.state.boxes.forEach((b, i) => { const [bx, by] = this.pos(b); this.tweens.add({ targets: this.boxes[i], x: bx, y: by, duration: MOVE_MS, ease: 'Quad.Out' }); });
    this.time.delayedCall(MOVE_MS, () => this.refreshBoxes(true));
    this.updateHud();
  }

  refreshBoxes(fx: boolean) {
    let done = 0;
    this.state.boxes.forEach((b, i) => {
      const on = this.isGoal(b), img = this.boxes[i];
      const was = img.getData('on');
      img.setTint(on ? COLORS.boxDone : COLORS.box).setData('on', on);
      if (on) done++;
      if (fx && on && !was) { sfx.play('pickup'); this.juice.burst(img.x, img.y, COLORS.goal, { count: 12, speed: 180 }); this.juice.squash(img, 1.3, 1.3); }
    });
    if (done === this.state.boxes.length && fx) this.solved();
  }

  updateHud() {
    this.hud.setText(`MOVES ${this.moves}   ·   Z undo   ·   R restart`);
    playtest({ level: this.level, moves: this.moves, onGoal: this.state.boxes.filter((b) => this.isGoal(b)).length, boxes: this.state.boxes.length });
  }

  solved() {
    this.busy = true;
    sfx.notes('select', [0, 4, 7, 12], 0.08);
    this.juice.zoomPunch(1.06, 400);
    for (const b of this.boxes) this.juice.ring(b.x, b.y, COLORS.goal, { radius: 50 });
    save.best('best', this.level + 1);
    const next = this.level + 1;
    const t = text(this, W / 2, H - 50, next < LEVELS.length ? 'SOLVED!' : 'ALL LEVELS SOLVED!', { size: 32, color: '#5dffa0', shadow: true }).setScale(0);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.Out' });
    this.time.delayedCall(1100, () => {
      if (next < LEVELS.length) this.scene.restart({ level: next });
      else this.scene.start('GameOver', { won: true, title: 'ALL CLEAR!', score: LEVELS.length, scoreLabel: (n: number) => `${Math.round(n)} LEVELS`, retryData: { level: 0 } });
    });
  }
}
