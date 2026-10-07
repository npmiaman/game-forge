/** Grandma (unkillable stalker) and zombies (fodder): box-built models + AI. */
import * as THREE from 'three';
import { angleDiff, damp } from '@kit/math';
import type { P } from '@kit/grid';
import { House, toCell, toWorld } from './house';
import { GRANNY, ZOMBIE, CELL } from './config';
import { loadModel, animate } from '@kit/assets';

type Anim = ReturnType<typeof animate>;
/** clone every material on a model so per-actor tint/flash doesn't leak to other actors */
function ownMaterials(m: THREE.Object3D, tint?: number, amount = 0.3) {
  const mats: THREE.MeshStandardMaterial[] = [];
  m.traverse((c) => { const mesh = c as THREE.Mesh; if (!mesh.isMesh) return; const mat = (mesh.material as THREE.MeshStandardMaterial).clone(); if (tint !== undefined) mat.color.lerp(new THREE.Color(tint), amount); mesh.material = mat; mats.push(mat); });
  return mats;
}

export interface Senses { px: number; pz: number; hiding: boolean; flashlight: boolean; crouching: boolean }
export interface ActorEvents {
  step(x: number, z: number, heavy: boolean): void;
  spotted(): void;
  caught(): void;
  door(x: number, z: number): void;
  bang(x: number, z: number): void;
  attack(damage: number): void;
  groan(x: number, z: number): void;
}

const mat = (c: number, e = false) => (e ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
function part(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b;
}

/** Follows a cell path, opening doors (Grandma) or stopping at them (zombies). */
abstract class Walker {
  x = 0; z = 0; facing = 0; speed = 0;
  path: P[] | null = null; pathI = 0; repathT = 0; stepT = 0; anim = 0;
  root = new THREE.Group();
  constructor(protected house: House, protected ev: ActorEvents, public radius: number) {}
  get cell() { return toCell(this.x, this.z); }
  place(c: P) { const w = toWorld(c); this.x = w.x; this.z = w.z; this.path = null; }
  goTo(c: P, opensDoors: boolean) { this.path = this.house.path(this.cell, c, opensDoors); this.pathI = 1; return !!this.path; }
  /** Advance along path. Returns 'arrived' | 'door' (blocked by closed door) | 'moving' | 'none'. */
  follow(dt: number, speed: number, opensDoors: boolean): 'arrived' | 'door' | 'moving' | 'none' {
    if (!this.path) return 'none';
    if (this.pathI >= this.path.length) return 'arrived';
    const c = this.path[this.pathI], w = toWorld(c);
    const d = this.house.door(c);
    if (d && d.open < 0.6) {
      if (opensDoors && d.target === 0) { d.target = 1; this.ev.door(w.x, w.z); }
      this.speed = 0;
      return 'door';
    }
    const dx = w.x - this.x, dz = w.z - this.z, dist = Math.hypot(dx, dz);
    if (dist < 0.35) { this.pathI++; return this.pathI >= this.path.length ? 'arrived' : 'moving'; }
    this.move(dx / dist, dz / dist, speed, dt);
    return 'moving';
  }
  move(dirX: number, dirZ: number, speed: number, dt: number) {
    const want = Math.atan2(dirX, dirZ);
    this.facing += angleDiff(this.facing, want) * Math.min(1, dt * 8);
    const p = this.house.collide(this.x + dirX * speed * dt, this.z + dirZ * speed * dt, this.radius);
    this.x = p.x; this.z = p.z; this.speed = speed;
  }
  sync(dt: number) {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.facing;
    this.anim += dt * this.speed * 2.2;
  }
}

// ---------------------------------------------------------------- Grandma

export type GState = 'patrol' | 'investigate' | 'search' | 'chase' | 'stunned' | 'grab';
export class Grandma extends Walker {
  state: GState = 'patrol';
  t = 0; waitT = 0; lostT = 0; stunT = 0;
  lastSeen = { x: 0, z: 0 };
  sawHide = false;
  speedMul = 1;
  private legs: THREE.Mesh[] = []; private arms: THREE.Group[] = []; private body: THREE.Group; private eyes: THREE.Mesh[] = [];
  face: THREE.Group;
  private rig: Anim | null = null; private shovel: THREE.Object3D | null = null; private stunnedAnim = false;
  private headMat: THREE.MeshStandardMaterial | null = null; private eyeLight: THREE.PointLight | null = null;

  /** swap the placeholder box-granny for a real rigged character (grey bun, pale), with a shovel and glowing eyes */
  async dress() {
    const m = await loadModel('mini-characters/character-female-c', { height: 2.15 });
    ownMaterials(m, 0xd8d0c8, 0.3);
    this.root.add(m);
    this.body.visible = false;
    this.rig = animate(m); this.rig.play('idle');
    this.shovel = await loadModel('survival-kit/tool-shovel', { height: 1.4 });
    this.root.add(this.shovel);
    // eyes live on a "face" group at head height so the jump scare can find them
    // put the glowing eyes on the actual face: front of the head mesh, a bit below its centre
    this.root.updateMatrixWorld(true);
    const head = m.getObjectByName('head-mesh') ?? m.getObjectByName('head') ?? m;
    const hb = new THREE.Box3().setFromObject(head);
    const hc = hb.getCenter(new THREE.Vector3()); this.root.worldToLocal(hc);
    const front = this.root.worldToLocal(hb.max.clone()).z;
    this.face = new THREE.Group(); this.face.position.set(hc.x, hc.y + 0.15, front + 0.05); this.root.add(this.face);
    this.eyes = [];
    // her face glows red when she's hunting you (see update) — readable from any angle and pose
    const hm = (head as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (hm?.emissive) this.headMat = hm;
    this.eyeLight = new THREE.PointLight(0xff2020, 0.8, 4, 2); this.eyeLight.position.set(0, 0, 0.3); this.face.add(this.eyeLight);
  }

  constructor(house: House, ev: ActorEvents, scene: THREE.Scene) {
    super(house, ev, 0.38);
    const skin = mat(0xc9b8a0), dress = mat(0x6e6a72), apron = mat(0xa8a090), hair = mat(0xb8b8b8), dark = mat(0x1a1410), bat = mat(0x6b4a2a);
    const b = (this.body = new THREE.Group());
    this.root.add(b);
    for (const x of [-0.13, 0.13]) { const l = part(b, 0.14, 0.75, 0.14, dark, x, 0.38, 0); l.geometry.translate(0, -0.37, 0); l.position.y = 0.76; this.legs.push(l); }
    part(b, 0.62, 0.85, 0.36, dress, 0, 1.15, 0);
    part(b, 0.5, 0.6, 0.02, apron, 0, 1.05, 0.19);
    part(b, 0.5, 0.25, 0.32, dress, 0, 1.68, 0);
    for (const side of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(side * 0.38, 1.72, 0); b.add(a);
      const arm = part(a, 0.12, 0.62, 0.12, skin, 0, -0.31, 0);
      arm.castShadow = true;
      if (side === 1) { const club = part(a, 0.09, 0.8, 0.09, bat, 0, -0.62, 0.3); club.rotation.x = Math.PI / 2.4; }
      this.arms.push(a);
    }
    const f = (this.face = new THREE.Group()); f.position.set(0, 1.98, 0); b.add(f);
    part(f, 0.36, 0.4, 0.34, skin, 0, 0, 0);
    part(f, 0.42, 0.18, 0.4, hair, 0, 0.2, -0.03);
    part(f, 0.2, 0.2, 0.2, hair, 0, 0.28, -0.2);
    for (const x of [-0.08, 0.08]) this.eyes.push(part(f, 0.07, 0.05, 0.02, mat(0xff2020, true), x, 0.04, 0.175));
    part(f, 0.16, 0.04, 0.02, mat(0x200808, true), 0, -0.1, 0.175);
    for (const x of [-0.09, 0.09]) part(f, 0.1, 0.07, 0.01, mat(0xdddddd), x, 0.04, 0.18).material = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.6 }); // spectacles
    const eyeLight = new THREE.PointLight(0xff2020, 0.6, 3, 2); eyeLight.position.set(0, 0.04, 0.3); f.add(eyeLight);
    scene.add(this.root);
  }

  hear(x: number, z: number, radius: number) {
    if (this.state === 'chase' || this.state === 'stunned' || this.state === 'grab') return;
    if (Math.hypot(x - this.x, z - this.z) > radius) return;
    this.lastSeen = { x, z };
    this.state = 'investigate';
    this.goTo(toCell(x, z), true);
  }

  stun(seconds: number) { this.state = 'stunned'; this.stunT = seconds; this.path = null; }

  canSee(s: Senses) {
    if (s.hiding || this.state === 'stunned') return false;
    const dx = s.px - this.x, dz = s.pz - this.z, d = Math.hypot(dx, dz);
    const range = (s.crouching && !s.flashlight ? GRANNY.sightDark : GRANNY.sight) + (s.flashlight ? GRANNY.flashlightBonus : 0);
    if (d > range) return false;
    const inFov = Math.abs(angleDiff(this.facing, Math.atan2(dx, dz))) < (GRANNY.fov * Math.PI) / 360;
    if (!inFov && d > GRANNY.closeSense) return false;
    return this.house.los(this.x, this.z, s.px, s.pz);
  }

  update(dt: number, s: Senses, rand: () => number) {
    this.t += dt;
    const sees = this.canSee(s);
    const d = Math.hypot(s.px - this.x, s.pz - this.z);
    if (sees && this.state !== 'chase' && this.state !== 'grab') { this.state = 'chase'; this.ev.spotted(); }
    if (sees) { this.lastSeen = { x: s.px, z: s.pz }; this.lostT = 0; }

    switch (this.state) {
      case 'stunned':
        this.speed = 0;
        this.stunT -= dt;
        if (this.stunT <= 0) { this.state = 'investigate'; this.goTo(toCell(s.px, s.pz), true); }
        break;
      case 'chase': {
        if (s.hiding) {
          // she saw you climb in → she comes to drag you out; otherwise she lost you
          if (this.sawHide) { this.state = 'grab'; break; }
          this.state = 'search'; this.goTo(toCell(this.lastSeen.x, this.lastSeen.z), true); this.waitT = GRANNY.searchTime; break;
        }
        if (!sees) { this.lostT += dt; if (this.lostT > GRANNY.loseSightTime) { this.state = 'search'; this.goTo(toCell(this.lastSeen.x, this.lastSeen.z), true); this.waitT = GRANNY.searchTime; break; } }
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 0.3; this.goTo(toCell(this.lastSeen.x, this.lastSeen.z), true); }
        const sp = (GRANNY.chase) * this.speedMul;
        if (sees && d < CELL * 1.2) this.move((s.px - this.x) / d, (s.pz - this.z) / d, sp, dt);
        else this.follow(dt, sp, true);
        if (d < GRANNY.catchRange && !s.hiding) this.ev.caught();
        break;
      }
      case 'grab': {
        const r = this.follow(dt, GRANNY.chase * this.speedMul, true);
        if (r === 'none' || r === 'arrived' || d < 2.2) this.ev.caught();
        break;
      }
      case 'investigate': {
        const r = this.follow(dt, GRANNY.investigate * this.speedMul, true);
        if (r === 'arrived' || r === 'none') { this.state = 'search'; this.waitT = GRANNY.searchTime; this.path = null; }
        break;
      }
      case 'search': {
        const r = this.follow(dt, GRANNY.investigate * this.speedMul, true);
        if (r === 'arrived' || r === 'none') { this.speed = 0; this.facing += dt * 1.6; this.waitT -= dt; if (this.waitT <= 0) this.state = 'patrol'; }
        break;
      }
      case 'patrol': {
        const r = this.follow(dt, GRANNY.patrol * this.speedMul, true);
        if (r === 'arrived' || r === 'none') {
          this.speed = 0; this.waitT -= dt;
          if (this.waitT <= 0) { this.waitT = 1 + rand() * 2; this.goTo(this.house.randomFloor(rand), true); }
        }
        break;
      }
    }

    // footsteps: heavy, slow — the main audio cue
    if (this.speed > 0.1) { this.stepT -= dt * this.speed; if (this.stepT <= 0) { this.stepT = 1.1; this.ev.step(this.x, this.z, true); } }
    this.sync(dt);
    // animation
    const sw = Math.sin(this.anim) * Math.min(1, this.speed / 2);
    this.legs[0].rotation.x = sw * 0.5; this.legs[1].rotation.x = -sw * 0.5;
    const chasing = this.state === 'chase' || this.state === 'grab';
    this.arms[0].rotation.x = chasing ? -1.2 + sw * 0.2 : -sw * 0.4;
    this.arms[1].rotation.x = chasing ? -2.3 + Math.sin(this.t * 6) * 0.4 : sw * 0.4;  // bat raised when chasing
    this.body.rotation.x = this.state === 'stunned' ? 0.5 : damp(this.body.rotation.x, chasing ? 0.15 : 0.05, 6, dt);
    this.body.position.y = Math.abs(Math.sin(this.anim)) * 0.05;
    const glow = chasing ? 1 : 0.5;
    this.eyes.forEach((e) => ((e.material as THREE.MeshBasicMaterial).color.setRGB(glow, 0.1 * glow, 0.1 * glow)));
    if (this.headMat) {
      const pulse = chasing ? 0.35 + Math.sin(this.t * 9) * 0.15 : 0.06;
      this.headMat.emissive.setRGB(pulse, 0, 0);
      if (this.eyeLight) this.eyeLight.intensity = chasing ? 2.2 : 0.5;
    }
    if (this.rig) {
      this.rig.update(dt);
      if (this.state === 'stunned') { if (!this.stunnedAnim) { this.stunnedAnim = true; this.rig.play('die', { once: true, fade: 0.1 }); } }
      else {
        this.stunnedAnim = false;
        if (this.state === 'grab') this.rig.play('attack-melee-right', { speed: 1.4 });
        else if (this.speed > 2.6) this.rig.play('sprint', { speed: this.speed / 4 });
        else if (this.speed > 0.2) this.rig.play('walk', { speed: Math.max(0.6, this.speed / 1.8) });
        else this.rig.play('idle');
      }
      if (this.shovel) {
        // dragged low while walking; raised overhead when she's coming for you
        this.shovel.visible = this.state !== 'stunned';
        this.shovel.position.set(0.42, chasing ? 1.2 : 0.75, chasing ? 0.15 : 0.25);
        this.shovel.rotation.set(chasing ? -0.4 + Math.sin(this.t * 7) * 0.3 : 0.9, 0, chasing ? 0.2 : -0.15);
      }
    }
  }
}

// ---------------------------------------------------------------- Zombies

export class Zombie extends Walker {
  hp = ZOMBIE.hp; maxHp = ZOMBIE.hp;
  alive = true; deadT = 0; attackT = 0; windT = -1; flashT = 0; bangT = 0; groanT = 2 + Math.random() * 5;
  chasing = false; target: { x: number; z: number } | null = null; wanderT = 0;
  kx = 0; kz = 0;
  private legs: THREE.Mesh[] = []; private arms: THREE.Group[] = []; private body: THREE.Group;
  private mats: THREE.MeshStandardMaterial[] = [];
  private rig: Anim | null = null; private died = false;

  /** swap the placeholder for Kenney's animated zombie */
  async dress() {
    const m = await loadModel('graveyard-kit/character-zombie', { height: 1.75 });
    this.mats = ownMaterials(m);
    this.root.add(m);
    this.body.visible = false;
    this.rig = animate(m); this.rig.play('walk');
  }

  constructor(house: House, ev: ActorEvents, scene: THREE.Scene, hp: number) {
    super(house, ev, 0.32);
    this.hp = this.maxHp = hp;
    const m = (c: number) => { const x = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }); this.mats.push(x); return x; };
    const skin = m(0x6f8f5a), shirt = m(0x3a5a7a), pants = m(0x2e2a3a), torn = m(0x4a3a2a);
    const b = (this.body = new THREE.Group()); this.root.add(b);
    for (const x of [-0.12, 0.12]) { const l = part(b, 0.18, 0.8, 0.18, pants, x, 0, 0); l.geometry.translate(0, -0.4, 0); l.position.y = 0.8; this.legs.push(l); }
    part(b, 0.52, 0.72, 0.3, shirt, 0, 1.18, 0);
    part(b, 0.3, 0.2, 0.02, torn, 0.08, 1.0, 0.16);
    for (const side of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(side * 0.34, 1.48, 0); b.add(a);
      part(a, 0.15, 0.68, 0.15, skin, 0, -0.34, 0);
      a.rotation.x = -1.45; this.arms.push(a);
    }
    const h = part(b, 0.4, 0.4, 0.4, skin, 0, 1.76, 0);
    for (const x of [-0.09, 0.09]) part(h, 0.08, 0.06, 0.02, mat(0xff3020, true), x, 0.04, 0.205);
    part(h, 0.18, 0.06, 0.02, mat(0x1a0a0a, true), 0, -0.1, 0.205);
    scene.add(this.root);
  }

  hear(x: number, z: number, radius: number) {
    if (!this.alive || Math.hypot(x - this.x, z - this.z) > radius) return;
    this.target = { x, z }; this.chasing = true; this.repathT = 0;
  }

  hit(dmg: number, fromX: number, fromZ: number) {
    this.hp -= dmg; this.flashT = 0.12;
    const d = Math.hypot(this.x - fromX, this.z - fromZ) || 1;
    this.kx = ((this.x - fromX) / d) * 6; this.kz = ((this.z - fromZ) / d) * 6;
    this.chasing = true; this.target = { x: fromX, z: fromZ };
    if (this.hp <= 0) { this.alive = false; this.deadT = 0; }
    return !this.alive;
  }

  update(dt: number, s: Senses, rand: () => number) {
    if (!this.alive) {
      if (this.rig) { this.rig.update(dt); if (!this.died) { this.died = true; this.rig.play('die', { once: true, fade: 0.05 }); } }
      this.deadT += dt;
      this.body.rotation.x = -Math.min(Math.PI / 2, this.deadT * 5);
      this.body.position.y = Math.min(0.2, this.deadT);
      if (this.deadT > 4) this.root.visible = false;
      return;
    }
    const dx = s.px - this.x, dz = s.pz - this.z, d = Math.hypot(dx, dz);
    const sees = !s.hiding && d < ZOMBIE.sight && this.house.los(this.x, this.z, s.px, s.pz);
    if (sees) { this.chasing = true; this.target = { x: s.px, z: s.pz }; }
    // knockback
    if (Math.abs(this.kx) + Math.abs(this.kz) > 0.05) {
      const p = this.house.collide(this.x + this.kx * dt, this.z + this.kz * dt, this.radius);
      this.x = p.x; this.z = p.z; this.kx = damp(this.kx, 0, 8, dt); this.kz = damp(this.kz, 0, 8, dt);
    }
    this.attackT -= dt;
    if (sees && d < ZOMBIE.reach) {
      this.speed = 0;
      this.facing += angleDiff(this.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
      // telegraphed attack: arms go up, then the hit lands if you're still in reach
      if (this.attackT <= 0 && this.windT < 0) { this.windT = ZOMBIE.windup; this.ev.groan(this.x, this.z); }
    }
    if (this.windT >= 0) {
      this.windT -= dt;
      this.arms.forEach((a) => (a.rotation.x = -2.6));
      if (this.windT < 0) { this.attackT = ZOMBIE.attackEvery; if (d < ZOMBIE.reach + 0.3 && sees) this.ev.attack(ZOMBIE.damage); this.arms.forEach((a) => (a.rotation.x = -0.6)); }
    } else if (sees && d < ZOMBIE.reach) {
      // recovering between swings: hold position
    } else if (this.chasing && this.target) {
      if (sees && d < CELL * 1.2) this.move(dx / d, dz / d, ZOMBIE.chase, dt);
      else {
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 0.6;
          const goal = toCell(this.target.x, this.target.z);
          if (!this.goTo(goal, false)) this.goTo(goal, true);   // only reachable through a closed door → go bang on it
        }
        const r = this.follow(dt, ZOMBIE.chase, false);
        if (r === 'door') { this.bangT -= dt; if (this.bangT <= 0) { this.bangT = 1.4; const c = this.path![this.pathI], w = toWorld(c); this.ev.bang(w.x, w.z); this.arms.forEach((a) => (a.rotation.x = -2.3)); } }
        if (r === 'arrived' || r === 'none') { if (!sees) { this.chasing = false; this.target = null; } }
      }
    } else {
      // wander
      this.wanderT -= dt;
      if (this.wanderT <= 0 || !this.path) { this.wanderT = 4 + rand() * 4; const c = this.cell; this.goTo({ x: c.x + Math.round((rand() - 0.5) * 6), y: c.y + Math.round((rand() - 0.5) * 6) }, false); }
      this.follow(dt, ZOMBIE.wander, false);
    }
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 4 + rand() * 6; this.ev.groan(this.x, this.z); }
    if (this.speed > 0.1) { this.stepT -= dt * this.speed; if (this.stepT <= 0) { this.stepT = 1.3; this.ev.step(this.x, this.z, false); } }
    this.sync(dt);
    const sw = Math.sin(this.anim) * Math.min(1, this.speed);
    this.legs[0].rotation.x = sw * 0.6; this.legs[1].rotation.x = -sw * 0.6;
    if (this.windT < 0) this.arms.forEach((a, i) => (a.rotation.x = damp(a.rotation.x, -1.45 + Math.sin(this.anim + i) * 0.15, 6, dt)));
    this.body.rotation.z = Math.sin(this.anim * 0.5) * 0.08;
    this.flashT -= dt;
    const flash = this.flashT > 0;
    this.mats.forEach((m) => m.emissive.setHex(flash ? 0xaa0000 : 0x000000));
    if (this.rig) {
      this.rig.update(dt);
      if (this.windT >= 0) this.rig.play('attack-melee-right', { speed: 1.3, fade: 0.08 });
      else if (this.speed > 1.4) this.rig.play('sprint', { speed: this.speed / 3.2 });
      else if (this.speed > 0.15) this.rig.play('walk', { speed: Math.max(0.5, this.speed / 1.4) });
      else this.rig.play('idle');
    }
  }
}
