/** Players (human + AI share one class), the ball, and the AI brain. */
import * as THREE from 'three';
import { angleDiff, clamp, damp } from '@kit/math';
import { BALL, MOVE, PITCH, HEALTH, AI, GLOO } from './config';
import { HALF_L, HALF_W, TEAM_COLOR, ownGoalZ } from './pitch';
import { WEAPONS, type WeaponId, type Gloo, type Loot } from './weapons';
import { loadModel, animate } from '@kit/assets';

/** Kenney blaster per weapon */
export const GUN_MODEL: Record<WeaponId, string> = { pistol: 'blaster-c', smg: 'blaster-d', shotgun: 'blaster-e', rocket: 'blaster-b' };
/** Barrel direction per model, measured from the geometry (most point -z = our forward; blaster-e points +z) */
const GUN_FLIP: Record<string, number> = { 'blaster-e': Math.PI };

// ---------------------------------------------------------------- player

export class Player {
  x = 0; z = 0; vx = 0; vz = 0;
  /** yaw: forward = (-sin yaw, -cos yaw) — same convention as the camera */
  yaw = 0; aimPitch = 0;
  hp = HEALTH.max; armor = 0; alive = true; respawnT = 0;
  weapon: WeaponId = 'pistol'; special: WeaponId | null = null; ammo = 0; fireT = 0;
  gloo = GLOO.carry; stamina = MOVE.staminaMax; sprinting = false;
  goals = 0; knocks = 0; deaths = 0; lastHitBy: Player | null = null; hurtT = 0;
  // ai
  think = 0; moveX = 0; moveZ = 0; wantSprint = false; target: Player | null = null; glooT = 0; kickT = 0; aimErr = 0;
  root = new THREE.Group();
  gun = new THREE.Group(); muzzle = new THREE.Object3D();
  private model: THREE.Object3D | null = null; private anim: ReturnType<typeof animate> | null = null;
  private mats: THREE.MeshStandardMaterial[] = []; private hand: THREE.Object3D | null = null; private gunId = '';
  shootT = 0; private dead = false;
  ready: Promise<void>;

  constructor(scene: THREE.Scene, public name: string, public team: number, public number: number, public role: 'field' | 'keeper', public human = false, look = 'character-male-a') {
    // team ring under the feet — the clearest way to read teams at a glance
    const ringColor = role === 'keeper' ? (team === 0 ? 0x2ad16a : 0xd12aa0) : TEAM_COLOR[team];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: human ? 0.95 : 0.75 }));
    ring.position.y = 0.03; this.root.add(ring);
    this.muzzle.position.set(0, 0, -0.32); this.gun.add(this.muzzle);
    scene.add(this.root);
    this.ready = (async () => {
      const m = await loadModel(`mini-characters/${look}`, { height: 1.85 });
      m.rotation.y = Math.PI;   // Kenney characters face +z; ours face -z
      m.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.lerp(new THREE.Color(ringColor), 0.28);   // light team tint, keeps the outfit readable
        mesh.material = mat; this.mats.push(mat);
      });
      this.model = m; this.root.add(m);
      this.anim = animate(m); this.anim.play('idle');
      this.hand = m.getObjectByName('arm-right') ?? m;
      this.root.add(this.gun);   // gun follows the hand's position but always aims where the player faces
      await this.setGun();
    })();
  }

  /** swap the held blaster model to match the current weapon */
  async setGun() {
    const id = GUN_MODEL[this.weapon];
    if (id === this.gunId) return;
    this.gunId = id;
    const g = await loadModel(`blaster-kit/${id}`, { scale: 2.2 });
    while (this.gun.children.length > 1) this.gun.remove(this.gun.children[1]);
    g.rotation.y = GUN_FLIP[id] ?? 0;   // flip the model, not the group, so the muzzle marker stays at the front
    this.gun.add(g);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdX() { return -Math.sin(this.yaw); }
  get fwdZ() { return -Math.cos(this.yaw); }
  get ownGoal() { return ownGoalZ(this.team); }
  get enemyGoal() { return ownGoalZ(1 - this.team); }

  spawn(x: number, z: number) {
    Object.assign(this, { x, z, vx: 0, vz: 0, hp: HEALTH.max, alive: true, respawnT: 0, stamina: MOVE.staminaMax, lastHitBy: null });
    this.yaw = this.team === 0 ? 0 : Math.PI;
    this.root.visible = true;
  }

  equip(id: WeaponId) { this.special = id; this.weapon = id; this.ammo = WEAPONS[id].ammo; }

  /** damage → returns true if it knocked them out */
  damage(amount: number, from: Player | null) {
    if (!this.alive) return false;
    const toArmor = Math.min(this.armor, amount * 0.6);
    this.armor -= toArmor; this.hp -= amount - toArmor;
    this.lastHitBy = from; this.hurtT = 0.15;
    if (this.hp <= 0) { this.alive = false; this.deaths++; return true; }
    return false;
  }

  /** accelerate toward a desired direction (unit-ish), with sprint/stamina */
  steer(dirX: number, dirZ: number, sprint: boolean, dt: number, speedMul = 1) {
    const l = Math.hypot(dirX, dirZ);
    if (l > 1) { dirX /= l; dirZ /= l; }
    this.sprinting = sprint && l > 0.1 && this.stamina > 2;
    if (this.sprinting) this.stamina -= MOVE.sprintCost * dt; else this.stamina = Math.min(MOVE.staminaMax, this.stamina + MOVE.staminaRegen * dt);
    const top = (this.sprinting ? MOVE.sprint : MOVE.run) * speedMul;
    const tx = dirX * top, tz = dirZ * top, a = MOVE.accel * dt;
    const dx = tx - this.vx, dz = tz - this.vz, dl = Math.hypot(dx, dz);
    if (dl <= a) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / dl) * a; this.vz += (dz / dl) * a; }
  }

  integrate(dt: number, walls: Gloo[]) {
    this.x += this.vx * dt; this.z += this.vz * dt;
    const r = MOVE.radius;
    // goal mouths are open: you can walk into the net area but not through it
    const inMouth = Math.abs(this.x) < PITCH.goalWidth / 2 - r;
    const zLim = inMouth ? HALF_L + PITCH.goalDepth - r : HALF_L - r;
    this.x = clamp(this.x, -HALF_W + r, HALF_W - r);
    this.z = clamp(this.z, -zLim, zLim);
    if (Math.abs(this.z) > HALF_L) this.x = clamp(this.x, -PITCH.goalWidth / 2 + r, PITCH.goalWidth / 2 - r);
    for (const w of walls) {
      if (!w.alive) continue;
      const { d, cx, cz } = w.dist(this.x, this.z);
      const min = r + 0.25;
      if (d < min && d > 1e-4) { this.x = cx + ((this.x - cx) / d) * min; this.z = cz + ((this.z - cz) / d) * min; }
    }
  }

  animate(dt: number, time: number) {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
    if (!this.anim) return;
    this.anim.update(dt);
    this.kickT -= dt; this.shootT -= dt; this.hurtT -= dt;
    this.gun.visible = this.alive;
    if (!this.alive) { if (!this.dead) { this.dead = true; this.anim.play('die', { once: true, fade: 0.1 }); } return; }
    if (this.dead) this.dead = false;
    const sp = this.speed;
    if (this.kickT > 0) this.anim.play('attack-kick-right', { fade: 0.05, speed: 1.6 });
    else if (this.shootT > 0 && sp < 3) this.anim.play('holding-both-shoot', { fade: 0.08 });
    else if (sp > 8) this.anim.play('sprint', { speed: sp / 9 });
    else if (sp > 0.6) this.anim.play('walk', { speed: Math.max(0.6, sp / 3.5) });
    else this.anim.play('holding-both');
    for (const m of this.mats) m.emissive.setHex(this.hurtT > 0 ? 0x770000 : 0x000000);
    // gun sits where the 'holding' poses put both fists: chest height, in front of the body
    const run = this.anim.current === 'sprint' || this.anim.current === 'walk';
    this.gun.position.set(0.16, run ? 0.98 + Math.sin(time * 14) * 0.03 : 1.02, -0.38);
    if (GUN_MODEL[this.weapon] !== this.gunId) void this.setGun();
  }
}

// ---------------------------------------------------------------- ball

export class Ball {
  pos = new THREE.Vector3(0, BALL.radius, 0);
  vel = new THREE.Vector3();
  owner: Player | null = null;
  lastTouch: Player | null = null;
  noPickup = new Map<Player, number>();
  mesh: THREE.Mesh;
  private stealT = 0;

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#111';
    for (let i = 0; i < 10; i++) { const x = (i % 5) * 26 + (i > 4 ? 13 : 0), y = i > 4 ? 44 : 18; g.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } g.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  place(x: number, z: number) { this.pos.set(x, BALL.radius, z); this.vel.set(0, 0, 0); this.owner = null; this.noPickup.clear(); }

  kick(by: Player, dirX: number, dirZ: number, power: number, lift: number) {
    const l = Math.hypot(dirX, dirZ) || 1;
    this.owner = null; this.lastTouch = by;
    this.pos.set(by.x + (dirX / l) * (BALL.dribbleDist + 0.15), Math.max(this.pos.y, BALL.radius), by.z + (dirZ / l) * (BALL.dribbleDist + 0.15));
    this.vel.set((dirX / l) * power, power * lift, (dirZ / l) * power);
    this.noPickup.set(by, 0.35);
    by.kickT = 0.25;
  }

  /** Returns the team that scored, or -1. */
  update(dt: number, players: Player[], walls: Gloo[], onTouch: (p: Player, hard: number) => void): number {
    for (const [p, t] of this.noPickup) { if (t - dt <= 0) this.noPickup.delete(p); else this.noPickup.set(p, t - dt); }
    const o = this.owner;
    if (o && !o.alive) this.owner = null;
    if (this.owner) {
      const p = this.owner;
      const tx = p.x + p.fwdX * BALL.dribbleDist, tz = p.z + p.fwdZ * BALL.dribbleDist;
      this.vel.set((tx - this.pos.x) / Math.max(dt, 1e-3) * 0.5, 0, (tz - this.pos.z) / Math.max(dt, 1e-3) * 0.5);
      this.pos.x = damp(this.pos.x, tx, 25, dt); this.pos.z = damp(this.pos.z, tz, 25, dt); this.pos.y = BALL.radius;
      this.mesh.rotation.x -= p.speed * dt * 2.5;
      // tackles: an opponent close to the ball can poke it loose
      this.stealT -= dt;
      for (const q of players) if (q.alive && q.team !== p.team && Math.hypot(q.x - this.pos.x, q.z - this.pos.z) < 0.9 && this.stealT <= 0) {
        this.stealT = 0.25;
        if (Math.random() < 0.45) { this.owner = null; this.lastTouch = q; this.vel.set((this.pos.x - q.x) * 6 + p.vx, 2, (this.pos.z - q.z) * 6 + p.vz); this.noPickup.set(p, 0.6); onTouch(q, 0.5); }
      }
    } else {
      const v = this.vel;
      v.y -= BALL.gravity * dt;
      this.pos.addScaledVector(v, dt);
      if (this.pos.y < BALL.radius) {
        this.pos.y = BALL.radius;
        if (v.y < -2) { v.y = -v.y * BALL.bounce; if (v.y > 3) onTouch(null as unknown as Player, v.y / 10); } else v.y = 0;
        const f = Math.max(0, 1 - BALL.friction * dt); v.x *= f; v.z *= f;
      } else { const f = Math.max(0, 1 - BALL.airDrag * dt); v.x *= f; v.z *= f; }
      // goal check (ball fully over the line, between the posts, under the bar)
      const gw = PITCH.goalWidth / 2, r = BALL.radius;
      if (Math.abs(this.pos.z) > HALF_L + r && Math.abs(this.pos.x) < gw && this.pos.y < PITCH.goalHeight) return this.pos.z > 0 ? 1 : 0;
      // side boards
      if (Math.abs(this.pos.x) > HALF_W - r) { this.pos.x = Math.sign(this.pos.x) * (HALF_W - r); v.x = -v.x * 0.7; onTouch(null as unknown as Player, Math.abs(v.x) / 20); }
      // end boards everywhere except the goal mouth (between the posts, under the bar)
      const inMouth = Math.abs(this.pos.x) < gw - r * 0.5 && this.pos.y < PITCH.goalHeight;
      if (Math.abs(this.pos.z) > HALF_L - r && !inMouth && Math.abs(this.pos.z) < HALF_L + 0.6) {
        this.pos.z = Math.sign(this.pos.z) * (HALF_L - r); v.z = -v.z * 0.7; onTouch(null as unknown as Player, Math.abs(v.z) / 20);
      }
      // safety net: never leave the stadium
      if (Math.abs(this.pos.z) > HALF_L + PITCH.goalDepth) { this.pos.z = Math.sign(this.pos.z) * (HALF_L - r); v.z = -v.z * 0.5; }
      for (const w of walls) {
        if (!w.alive || this.pos.y > GLOO.height) continue;
        const { d, cx, cz } = w.dist(this.pos.x, this.pos.z);
        if (d < r + 0.25 && d > 1e-4) {
          const nx = (this.pos.x - cx) / d, nz = (this.pos.z - cz) / d, dot = v.x * nx + v.z * nz;
          if (dot < 0) { v.x -= 1.6 * dot * nx; v.z -= 1.6 * dot * nz; }
          this.pos.x = cx + nx * (r + 0.25); this.pos.z = cz + nz * (r + 0.25);
        }
      }
      this.mesh.rotation.x -= (v.z / r) * dt; this.mesh.rotation.z += (v.x / r) * dt;
      // pick up: nearest eligible player (keepers can catch anything near them)
      let best: Player | null = null, bd = Infinity;
      const speed = Math.hypot(v.x, v.z);
      for (const p of players) {
        if (!p.alive || this.noPickup.has(p)) continue;
        const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
        const reach = p.role === 'keeper' && Math.abs(this.pos.z - p.ownGoal) < 10 ? BALL.controlRange * AI.keeperReach : BALL.controlRange;
        const catchable = p.role === 'keeper' ? this.pos.y < 2.3 && (speed < 26 || Math.random() < 0.5) : this.pos.y < 1.1 && speed < 22;
        if (d < reach && catchable && d < bd) { bd = d; best = p; }
      }
      if (best) { this.owner = best; this.lastTouch = best; onTouch(best, 0.2); }
    }
    this.mesh.position.copy(this.pos);
    return -1;
  }
}

// ---------------------------------------------------------------- AI

export interface AiWorld {
  ball: Ball; players: Player[]; loot: Loot[]; zoneHalf: number;
  canSee(a: Player, b: Player): boolean;
  shoot(p: Player, tx: number, ty: number, tz: number): void;
  kick(p: Player, dirX: number, dirZ: number, power: number, lift: number): void;
  throwGloo(p: Player): void;
}

export function aiThink(p: Player, w: AiWorld, dt: number) {
  if (!p.alive) return;
  const { ball } = w;
  const mates = w.players.filter((q) => q.team === p.team && q.alive && q !== p);
  const foes = w.players.filter((q) => q.team !== p.team && q.alive);
  const goalZ = p.enemyGoal, dirToGoal = Math.sign(goalZ);
  const bx = ball.pos.x, bz = ball.pos.z;
  const dBall = Math.hypot(bx - p.x, bz - p.z);
  let tx = p.x, tz = p.z, sprint = false;
  const carrier = ball.owner;

  if (p.role === 'keeper') {
    const gz = p.ownGoal, side = Math.sign(gz);
    tx = clamp(bx * 0.3, -PITCH.goalWidth / 2 + 0.6, PITCH.goalWidth / 2 - 0.6);
    tz = gz - side * 1.6;
    const ballNear = Math.abs(bz - gz) < AI.keeperRange + 4 && Math.abs(bx) < PITCH.goalWidth * 1.6;
    if (!carrier && ballNear) { tx = bx; tz = clamp(bz, gz - side * 9, gz - side * 0.8); sprint = true; }
    if (carrier === p) {
      // clear it upfield toward a teammate (or just long)
      const m = mates.filter((q) => q.role !== 'keeper').sort((a, b) => Math.abs(a.z - goalZ) - Math.abs(b.z - goalZ))[0];
      p.think -= dt;
      if (p.think <= 0) { p.think = 0.6; const dx = m ? m.x - p.x : (Math.random() - 0.5) * 20, dz = m ? m.z - p.z : dirToGoal * 25; w.kick(p, dx, dz, 26, 0.45); }
    }
  } else if (carrier === p) {
    // dribble to goal, dodging the nearest defender; shoot when close
    const nearFoe = foes.reduce<Player | null>((a, q) => (!a || Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? q : a), null);
    tx = clamp(p.x * 0.6, -6, 6); tz = goalZ;
    if (nearFoe && Math.hypot(nearFoe.x - p.x, nearFoe.z - p.z) < 6) tx = p.x + (p.x > nearFoe.x ? 4 : -4);
    sprint = true;
    const dGoal = Math.hypot(p.x, goalZ - p.z);
    p.think -= dt;
    if (p.think <= 0) {
      p.think = 0.3;
      const keeper = foes.find((q) => q.role === 'keeper');
      if (dGoal < AI.goalShotRange && Math.abs(p.x) < 14) {
        const aimX = (keeper && keeper.x > 0 ? -1 : 1) * (PITCH.goalWidth / 2 - 1.1) + (Math.random() - 0.5) * 1.4 * AI.difficulty;
        w.kick(p, aimX - p.x, goalZ - p.z, 26 + Math.random() * 8, 0.05 + Math.random() * 0.1);
      } else if (nearFoe && Math.hypot(nearFoe.x - p.x, nearFoe.z - p.z) < 3 && mates.length) {
        const m = mates.filter((q) => q.role !== 'keeper')[0];
        if (m) { const d = Math.hypot(m.x - p.x, m.z - p.z); w.kick(p, m.x - p.x, m.z - p.z, clamp(d * 1.1, 12, 28), 0.1); }
      }
    }
  } else if (!carrier || carrier.team !== p.team) {
    // chase the ball / carrier if I'm my team's closest outfielder; otherwise mark goal-side
    const outfield = w.players.filter((q) => q.team === p.team && q.alive && q.role !== 'keeper');
    const closest = outfield.sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz))[0];
    if (closest === p) { tx = bx; tz = bz; sprint = dBall > 4; }
    else { tx = bx * 0.5; tz = (bz + p.ownGoal) / 2; sprint = Math.hypot(tx - p.x, tz - p.z) > 8; }
  } else {
    // teammate has it: get open ahead of the ball
    const lane = p.number % 2 ? -1 : 1;
    tx = clamp(bx + lane * 9, -HALF_W + 3, HALF_W - 3); tz = clamp(bz + dirToGoal * 10, -HALF_L + 4, HALF_L - 4);
    sprint = Math.hypot(tx - p.x, tz - p.z) > 6;
  }

  // loot: grab nearby upgrades when it's not my job to chase the ball
  if (carrier !== p && p.role !== 'keeper') {
    const want = w.loot.filter((l) => l.alive && l.y < 0.1 && Math.hypot(l.x - p.x, l.z - p.z) < (l.airdrop ? 18 : 9) &&
      (l.airdrop || (l.kind === 'medkit' && p.hp < 60) || (l.kind === 'armor' && p.armor < 20) || (['smg', 'shotgun', 'rocket'].includes(l.kind) && !p.special) || l.kind === 'gloo'));
    if (want.length && dBall > 6) { tx = want[0].x; tz = want[0].z; sprint = true; }
  }
  // stay inside the zone
  if (Math.abs(tx) > w.zoneHalf - 1) tx = Math.sign(tx) * (w.zoneHalf - 1.5);

  const mx = tx - p.x, mz = tz - p.z, ml = Math.hypot(mx, mz);
  p.steer(ml > 0.4 ? mx / ml : 0, ml > 0.4 ? mz / ml : 0, sprint, dt, p.role === 'keeper' ? 0.85 : AI.difficulty * 0.92 + 0.08);

  // combat: shoot the most relevant visible enemy (carrier first)
  p.think -= 0;
  const targets = foes.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < AI.shootRange && w.canSee(p, q));
  const tgt = targets.find((q) => q === carrier) ?? targets.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  p.target = tgt ?? null;
  let faceYaw = ml > 0.5 ? Math.atan2(-mx, -mz) : p.yaw;
  if (tgt && carrier !== p) {
    faceYaw = Math.atan2(-(tgt.x - p.x), -(tgt.z - p.z));
    p.aimErr = damp(p.aimErr, (Math.random() - 0.5) * 2 * AI.aim, 3, dt);
    if (Math.abs(angleDiff(p.yaw, faceYaw)) < 0.3) w.shoot(p, tgt.x + p.aimErr * 8, 0.8 + Math.random() * 0.7, tgt.z + p.aimErr * 8);   // body shots; heads are rare
  }
  p.yaw += angleDiff(p.yaw, faceYaw) * Math.min(1, dt * (carrier === p ? 6 : 10));
  // gloo wall when hurt and under fire
  p.glooT -= dt;
  if (p.gloo > 0 && p.hp < 45 && tgt && p.glooT <= 0 && p.role !== 'keeper') { p.glooT = 6; w.throwGloo(p); }
}
