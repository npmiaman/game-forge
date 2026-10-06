/** Guns, tracers, rockets, gloo walls, loot crates and airdrops. */
import * as THREE from 'three';
import { GLOO } from './config';
import { HALF_L, HALF_W } from './pitch';

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rocket';
export interface WeaponDef { name: string; damage: number; rate: number; pellets: number; spread: number; range: number; ammo: number; color: number; auto: boolean }
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol:  { name: 'PISTOL',  damage: 17, rate: 3.5, pellets: 1, spread: 0.018, range: 45, ammo: Infinity, color: 0xfff2a0, auto: false },
  smg:     { name: 'SMG',     damage: 10, rate: 11,  pellets: 1, spread: 0.045, range: 35, ammo: 90,       color: 0xffd060, auto: true },
  shotgun: { name: 'SHOTGUN', damage: 9,  rate: 1.2, pellets: 8, spread: 0.11,  range: 16, ammo: 14,       color: 0xffa040, auto: false },
  rocket:  { name: 'ROCKET',  damage: 75, rate: 0.8, pellets: 1, spread: 0,     range: 60, ammo: 5,        color: 0xff5030, auto: false },
};

export type LootKind = 'smg' | 'shotgun' | 'rocket' | 'medkit' | 'armor' | 'gloo';
export const LOOT_COLOR: Record<LootKind, number> = { smg: 0xffd060, shotgun: 0xffa040, rocket: 0xff5030, medkit: 0xff4466, armor: 0x66aaff, gloo: 0x9ff0ff };
export const LOOT_LABEL: Record<LootKind, string> = { smg: 'SMG', shotgun: 'SHOTGUN', rocket: 'ROCKET LAUNCHER', medkit: 'MEDKIT', armor: 'ARMOR', gloo: 'GLOO WALLS' };

// ---------------------------------------------------------------- tracers

export class Tracers {
  private lines: { line: THREE.Line; life: number }[] = [];
  constructor(private scene: THREE.Scene) {}
  add(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    let t = this.lines.find((l) => l.life <= 0);
    if (!t) {
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      t = { line: new THREE.Line(g, new THREE.LineBasicMaterial({ transparent: true })), life: 0 };
      this.scene.add(t.line); this.lines.push(t);
    }
    const p = t.line.geometry.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    t.line.geometry.computeBoundingSphere();
    (t.line.material as THREE.LineBasicMaterial).color.setHex(color);
    t.life = 0.09; t.line.visible = true;
  }
  update(dt: number) {
    for (const t of this.lines) if (t.life > 0) { t.life -= dt; (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.09); if (t.life <= 0) t.line.visible = false; }
  }
}

// ---------------------------------------------------------------- gloo walls

export class Gloo {
  hp = GLOO.hp; life = GLOO.life; alive = true;
  ax: number; az: number; bx: number; bz: number; nx: number; nz: number;
  mesh = new THREE.Group();
  constructor(scene: THREE.Scene, public x: number, public z: number, facing: number, public team: number) {
    // wall runs perpendicular to the thrower's facing; normal points back at the thrower
    const tx = Math.cos(facing), tz = -Math.sin(facing);
    this.nx = -Math.sin(facing); this.nz = -Math.cos(facing);
    const hw = GLOO.width / 2;
    this.ax = x - tx * hw; this.az = z - tz * hw; this.bx = x + tx * hw; this.bz = z + tz * hw;
    const mat = new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x2a6a80, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = (i / (n - 1) - 0.5) * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(GLOO.width / n + 0.05, GLOO.height * (1 - Math.abs(k) * 0.15), 0.45), mat);
      // slight curve toward the thrower, like the real thing
      b.position.set(k * hw, (GLOO.height * (1 - Math.abs(k) * 0.15)) / 2, -k * k * 0.35);
      b.rotation.y = k * 0.18; b.castShadow = true;
      this.mesh.add(b);
    }
    this.mesh.position.set(x, 0, z); this.mesh.rotation.y = facing;
    this.mesh.scale.set(1, 0.05, 1);
    scene.add(this.mesh);
  }
  /** distance from point to the wall segment in xz */
  dist(px: number, pz: number) {
    const dx = this.bx - this.ax, dz = this.bz - this.az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - this.ax) * dx + (pz - this.az) * dz) / l2));
    const cx = this.ax + dx * t, cz = this.az + dz * t;
    return { d: Math.hypot(px - cx, pz - cz), cx, cz };
  }
  /** ray (origin o, unit dir d) vs wall: returns distance along the ray or Infinity */
  ray(o: THREE.Vector3, d: THREE.Vector3) {
    const sx = this.bx - this.ax, sz = this.bz - this.az;
    const den = d.x * sz - d.z * sx;
    if (Math.abs(den) < 1e-6) return Infinity;
    const t = ((this.ax - o.x) * sz - (this.az - o.z) * sx) / den;
    const u = ((this.ax - o.x) * d.z - (this.az - o.z) * d.x) / den;
    if (t < 0 || u < 0 || u > 1) return Infinity;
    const y = o.y + d.y * t;
    return y >= 0 && y <= GLOO.height ? t : Infinity;
  }
  update(dt: number) {
    this.life -= dt;
    this.mesh.scale.y = Math.min(1, this.mesh.scale.y + dt * 8);
    if (this.life < 1) this.mesh.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.85 * this.life));
    if (this.life <= 0 || this.hp <= 0) this.alive = false;
  }
}

// ---------------------------------------------------------------- loot + airdrops

export interface Loot { kind: LootKind; x: number; z: number; y: number; vy: number; mesh: THREE.Group; chute?: THREE.Object3D; airdrop: boolean; contents?: LootKind[]; t: number; alive: boolean }

export function makeCrate(kind: LootKind, airdrop: boolean) {
  const g = new THREE.Group();
  const s = airdrop ? 1.3 : 0.75;
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), new THREE.MeshStandardMaterial({ color: airdrop ? 0x8a6a2a : 0x2e3440, roughness: 0.6 }));
  box.position.y = s * 0.4; box.castShadow = true; g.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.02, s * 0.18, s + 0.02), new THREE.MeshBasicMaterial({ color: airdrop ? 0xff3a2a : LOOT_COLOR[kind] }));
  band.position.y = s * 0.4; g.add(band);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, airdrop ? 30 : 4, 8, 1, true), new THREE.MeshBasicMaterial({ color: airdrop ? 0xff4a2a : LOOT_COLOR[kind], transparent: true, opacity: 0.35, depthWrite: false }));
  beam.position.y = airdrop ? 15 : 2; g.add(beam);
  let chute: THREE.Object3D | undefined;
  if (airdrop) {
    chute = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff5a2a, side: THREE.DoubleSide }));
    canopy.position.y = 4.5; chute.add(canopy);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
      l.position.set(x * 0.9, 2.6, z * 0.9); l.rotation.set(z * 0.3, 0, -x * 0.3); chute.add(l);
    }
    g.add(chute);
  }
  return { g, chute };
}

export class Rocket {
  alive = true; life = 2.5;
  mesh: THREE.Mesh;
  constructor(scene: THREE.Scene, public pos: THREE.Vector3, public vel: THREE.Vector3, public owner: unknown, public team: number) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7040 }));
    this.mesh.position.copy(pos); this.mesh.lookAt(pos.clone().add(vel));
    scene.add(this.mesh);
  }
}

/** keep a point inside the boards */
export const inBounds = (x: number, z: number, r: number) => ({ x: Math.max(-HALF_W + r, Math.min(HALF_W - r, x)), z: Math.max(-HALF_L + r, Math.min(HALF_L - r, z)) });
