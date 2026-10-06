/**
 * Endless voxel track. Distance along the track is `t` (world z = -t).
 * The road's centre line is xc(t). The world is built in chunks of TRACK.chunk rows,
 * generated ahead of the car and disposed behind it.
 */
import * as THREE from 'three';
import { Rng } from '@kit/rng';
import { clamp } from '@kit/math';
import { TRACK, RACE } from './config';
import { bannerTexture, boostTexture, type Blocks } from './blocks';

// ------------------------------------------------------------------ track shape

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Centre line x at distance t. Gets curvier with each checkpoint. */
export function xc(t: number) {
  // curvier each checkpoint, capped so the steepest bends stay drivable (max slope ≈ 0.75)
  const k = smooth(40, 200, t) * Math.min(1.3, 1 + Math.floor(t / RACE.checkpointEvery) * TRACK.ampGrowth * 0.05);
  return k * (TRACK.amp1 * Math.sin(t * 0.017) + TRACK.amp2 * Math.sin(t * 0.043 + 1.3) + 3 * Math.sin(t * 0.091 + 0.4));
}
/** Track direction angle at t (0 = straight ahead, + = curving to +x). */
export function trackAngle(t: number) { return Math.atan2(xc(t + 1) - xc(t - 1), 2); }

// ------------------------------------------------------------------ biomes

export interface Biome { name: string; surface: string; fill: string; deep: string; sky: number; fog: number; tree: 'oak' | 'cactus' | 'spruce' | 'none'; extra?: string }
export const BIOMES: Biome[] = [
  { name: 'PLAINS', surface: 'grass', fill: 'dirt', deep: 'stone', sky: 0x8ec5ff, fog: 0xb9dcff, tree: 'oak' },
  { name: 'DESERT', surface: 'sand', fill: 'sandstone', deep: 'sandstone', sky: 0xffd9a0, fog: 0xffe6bf, tree: 'cactus' },
  { name: 'SNOWY PEAKS', surface: 'snow', fill: 'dirt', deep: 'stone', sky: 0xcfe3ff, fog: 0xeef5ff, tree: 'spruce', extra: 'ice' },
  { name: 'THE NETHER', surface: 'netherrack', fill: 'netherrack', deep: 'netherrack', sky: 0x3a0d0d, fog: 0x5a1a10, tree: 'none', extra: 'lava' },
];
export const checkpointIndex = (t: number) => Math.floor(t / RACE.checkpointEvery);
export const biomeAt = (t: number) => BIOMES[((checkpointIndex(t) % BIOMES.length) + BIOMES.length) % BIOMES.length];

// ------------------------------------------------------------------ noise

function hash(x: number, y: number) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const noise = (x: number, y: number) => vnoise(x * 0.08, y * 0.08) * 0.65 + vnoise(x * 0.2, y * 0.2) * 0.35;

// ------------------------------------------------------------------ obstacles

export type Kind = 'crate' | 'stone' | 'tnt' | 'coin' | 'boost' | 'ramp';
export interface Obstacle { kind: Kind; x: number; t: number; hw: number; hd: number; h: number; alive: boolean; mesh: THREE.Object3D; spin?: number }
export interface Gate { t: number; index: number; passed: boolean; group: THREE.Group }

class Chunk {
  group = new THREE.Group();
  obstacles: Obstacle[] = [];
  gates: Gate[] = [];
  constructor(public index: number) {}
}

const RAMP_LEN = 7, RAMP_W = 6, RAMP_H = 2.2;
function rampGeometry() {
  // wedge: rises from t=0 (height 0) to t=len (height h); local -z is forward
  const w = RAMP_W / 2, L = RAMP_LEN, h = RAMP_H;
  const p = [
    [-w, 0, 0], [w, 0, 0], [w, h, -L], [-w, h, -L], // slope
    [-w, 0, -L], [w, 0, -L],                         // back bottom
  ];
  const tri = (a: number, b: number, c: number) => [...p[a], ...p[b], ...p[c]];
  const pos = new Float32Array([...tri(0, 1, 2), ...tri(0, 2, 3), ...tri(3, 2, 5), ...tri(3, 5, 4), ...tri(0, 3, 4), ...tri(1, 5, 2)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uv = new Float32Array(pos.length / 3 * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 2 + 0.5; uv[i * 2 + 1] = -pos[i * 3 + 2] / 2; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export class World {
  chunks = new Map<number, Chunk>();
  private lastWallT = -99;
  root = new THREE.Group();
  private mats: Record<string, THREE.Material> = {};
  private rampGeo = rampGeometry();
  private padGeo = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2);
  private boostMat: THREE.MeshBasicMaterial;
  private rampMat: THREE.MeshLambertMaterial;

  constructor(private B: Blocks, scene: THREE.Scene) {
    scene.add(this.root);
    const bt = boostTexture(); bt.wrapS = bt.wrapT = THREE.RepeatWrapping;
    this.boostMat = new THREE.MeshBasicMaterial({ map: bt });
    // ramp uses the planks tile from a separate repeating texture so it tiles across the slope
    const rc = document.createElement('canvas'); rc.width = rc.height = 16;
    const rg = rc.getContext('2d')!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const s = y % 4 === 3 ? 0.65 : 0.92 + Math.random() * 0.12; rg.fillStyle = `rgb(${168 * s | 0},${136 * s | 0},${82 * s | 0})`; rg.fillRect(x, y, 1, 1); }
    const rt = new THREE.CanvasTexture(rc); rt.magFilter = THREE.NearestFilter; rt.wrapS = rt.wrapT = THREE.RepeatWrapping; rt.colorSpace = THREE.SRGBColorSpace;
    this.rampMat = new THREE.MeshLambertMaterial({ map: rt, side: THREE.DoubleSide });
  }

  reset() { for (const c of this.chunks.values()) this.drop(c); this.chunks.clear(); this.lastWallT = -99; }

  /** Keep chunks around distance t built. Returns true if anything was generated. */
  update(t: number) {
    const ci = Math.floor(t / TRACK.chunk);
    for (const [k, c] of this.chunks) if (k < ci - TRACK.behind) { this.drop(c); this.chunks.delete(k); }
    let built = 0;
    for (let k = Math.max(0, ci - TRACK.behind); k <= ci + TRACK.ahead && built < 2; k++) {
      if (!this.chunks.has(k)) { this.chunks.set(k, this.build(k)); built++; }
    }
    return built > 0;
  }

  /** Obstacles + gates near distance t. */
  *near(t: number, range = 8) {
    for (const k of [Math.floor((t - range) / TRACK.chunk), Math.floor((t + range) / TRACK.chunk)].filter((v, i, a) => a.indexOf(v) === i)) {
      const c = this.chunks.get(k);
      if (c) for (const o of c.obstacles) if (o.alive && Math.abs(o.t - t) < range) yield o;
    }
  }
  gates() { const g: Gate[] = []; for (const c of this.chunks.values()) g.push(...c.gates); return g; }
  allObstacles() { const o: Obstacle[] = []; for (const c of this.chunks.values()) o.push(...c.obstacles); return o; }

  private drop(c: Chunk) {
    this.root.remove(c.group);
    c.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
  }

  private build(k: number): Chunk {
    const chunk = new Chunk(k);
    const L = TRACK.chunk, R = TRACK.roadHalf, S = TRACK.shoulder;
    const rng = new Rng(k * 7919 + 13);
    const cells: Record<string, number[]> = {};
    const put = (type: string, x: number, y: number, z: number) => (cells[type] ??= []).push(x + 0.5, y + 0.5, z + 0.5);

    for (let r = 0; r < L; r++) {
      const t = k * L + r, z = -t - 1;
      const biome = biomeAt(t), c = xc(t + 0.5);
      for (let i = Math.floor(c - 36); i <= Math.floor(c + 36); i++) {
        const off = i + 0.5 - c, d = Math.abs(off);
        if (d <= R) {
          const curb = d > R - 1;
          put(curb ? ((t >> 1) & 1 ? 'curb_red' : 'curb_white') : Math.abs(off) < 0.5 && (t % 6) < 3 ? 'road_line' : 'road', i, -1, z);
          continue;
        }
        const n = noise(i, t);
        if (d <= R + S) {
          if (biome.extra === 'lava' && d > R + 1.5 && n > 0.62) put('lava', i, -1, z); else put(biome.surface, i, -1, z);
          continue;
        }
        const h = 1 + Math.floor(clamp((d - R - S) * 0.3 + n * 3 - 0.6, 0, 11));
        if (biome.extra === 'lava' && n > 0.7 && h <= 2) { put('lava', i, h - 1, z); continue; }
        const top = biome.extra === 'ice' && h <= 1 && n < 0.3 ? 'ice' : h >= 8 && biome.name === 'PLAINS' ? 'stone' : biome.surface;
        put(top, i, h - 1, z);
        for (let y = h - 2; y >= Math.max(-1, h - 3); y--) put(y < h - 2 ? biome.deep : biome.fill, i, y, z);
        // trees
        if (d > R + S + 2 && rng.chance(biome.tree === 'cactus' ? 0.012 : 0.018)) this.tree(biome.tree, i, h, z, put, rng);
        if (biome.tree === 'none' && rng.chance(0.006)) { put('glowstone', i, h, z); put('glowstone', i, h + 1, z); }
      }
    }

    // instanced meshes, one per block type
    const m = new THREE.Matrix4();
    for (const [type, p] of Object.entries(cells)) {
      const n = p.length / 3;
      const mesh = new THREE.InstancedMesh(this.B.geo[type], this.B.material(type), n);
      for (let j = 0; j < n; j++) mesh.setMatrixAt(j, m.makeTranslation(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      chunk.group.add(mesh);
    }

    this.obstaclesFor(chunk, rng);
    this.root.add(chunk.group);
    return chunk;
  }

  private tree(kind: Biome['tree'], i: number, h: number, z: number, put: (t: string, x: number, y: number, z: number) => void, rng: Rng) {
    if (kind === 'cactus') { const n = rng.int(2, 4); for (let y = 0; y < n; y++) put('cactus', i, h + y, z); return; }
    if (kind === 'none') return;
    const leaves = kind === 'spruce' ? 'spruce' : 'leaves';
    const trunk = kind === 'spruce' ? rng.int(5, 7) : rng.int(4, 5);
    for (let y = 0; y < trunk; y++) put('log', i, h + y, z);
    if (kind === 'oak') {
      for (let dy = trunk - 2; dy <= trunk; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (dy === trunk && (Math.abs(dx) === 2 || Math.abs(dz) === 2)) continue;
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if (dx === 0 && dz === 0 && dy < trunk) continue;
        put(leaves, i + dx, h + dy, z + dz);
      }
      put(leaves, i, h + trunk + 1, z);
    } else {
      for (let dy = 2; dy <= trunk; dy++) { const r = Math.max(0, Math.floor((trunk - dy) / 2)); for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx || dz || dy === trunk) put(leaves, i + dx, h + dy, z + dz); }
      put(leaves, i, h + trunk + 1, z);
    }
  }

  // ---------------------------------------------------------------- obstacles & gates

  private obstaclesFor(chunk: Chunk, rng: Rng) {
    const L = TRACK.chunk, t0 = chunk.index * L, R = TRACK.roadHalf;
    const cpEvery = RACE.checkpointEvery;
    // checkpoint gates
    for (let g = Math.ceil(t0 / cpEvery) * cpEvery; g < t0 + L; g += cpEvery) if (g > 0) chunk.gates.push(this.gate(g, chunk));
    if (t0 < 70) return;
    const level = checkpointIndex(t0);
    const density = Math.min(0.85, TRACK.density + level * TRACK.densityGrowth);
    const nearGate = (t: number) => { const m = t % cpEvery; return m < 14 || m > cpEvery - 14; };
    let lastWall = -99;
    for (let slot = 0; slot < 3; slot++) {
      if (!rng.chance(density)) continue;
      const t = t0 + 2 + slot * 8 + rng.range(0, 4);
      if (nearGate(t)) continue;
      const lane = () => rng.range(-R + 1.5, R - 1.5);
      let pick = rng.weighted<string>([['crates', 10], ['wall', Math.min(9, 3 + level * 1.5)], ['tnt', 4], ['coins', 9], ['boost', 4], ['ramp', 3 + level]]);
      if (pick === 'wall' && (slot - lastWall < 2 || Math.abs(t - this.lastWallT) < 16)) pick = 'coins';   // never two walls close together
      if (pick === 'wall') { lastWall = slot; this.lastWallT = t; }
      if (pick === 'crates') for (let n = rng.int(2, 4); n > 0; n--) this.block(chunk, 'crate', xc(t) + lane(), t + rng.range(-2, 2));
      else if (pick === 'tnt') this.block(chunk, 'tnt', xc(t) + lane(), t);
      else if (pick === 'wall') {
        const gap = rng.range(-R + 2.5, R - 2.5), gw = Math.max(4.2, 5.6 - level * 0.15);   // ≥4 blocks open
        for (let x = -R + 0.5; x <= R - 0.5; x += 1) if (Math.abs(x - gap) > gw / 2) this.block(chunk, 'stone', xc(t) + x, t);
      } else if (pick === 'coins') {
        const l = lane();
        for (let n = 0; n < 5; n++) this.block(chunk, 'coin', xc(t + n * 2.5) + l, t + n * 2.5);
      } else if (pick === 'boost') this.pad(chunk, xc(t) + rng.range(-R + 2, R - 2), t);
      else if (pick === 'ramp') {
        const l = rng.range(-R + 3, R - 3);
        this.ramp(chunk, xc(t) + l, t);
        for (let n = 0; n < 4; n++) { const ct = t + RAMP_LEN + 4 + n * 3; const c = this.block(chunk, 'coin', xc(ct) + l, ct); c.mesh.position.y = 3.5 + Math.sin((n / 3) * Math.PI) * 2; c.h = 99; (c as any).airY = c.mesh.position.y; }
      }
    }
  }

  private block(chunk: Chunk, kind: Kind, x: number, t: number): Obstacle {
    const type = kind === 'crate' ? 'planks' : kind === 'stone' ? 'cobble' : kind === 'tnt' ? 'tnt' : 'gold';
    const size = kind === 'crate' ? 1.6 : kind === 'stone' ? 1 : kind === 'tnt' ? 1.4 : 0.7;
    const mesh = new THREE.Mesh(this.B.geo[type], kind === 'coin' ? this.B.glow : this.B.material(type));
    if (kind === 'stone') { mesh.scale.set(1, 2, 1); mesh.position.set(x, 1, -t); }
    else { mesh.scale.setScalar(size); mesh.position.set(x, kind === 'coin' ? 1.3 : size / 2, -t); }
    if (kind === 'crate') mesh.rotation.y = (x * 13.7) % 0.5;
    chunk.group.add(mesh);
    const o: Obstacle = { kind, x, t, hw: kind === 'stone' ? 0.5 : size / 2, hd: kind === 'stone' ? 0.5 : size / 2, h: kind === 'stone' ? 2 : size, alive: true, mesh, spin: kind === 'coin' ? 1 : 0 };
    chunk.obstacles.push(o);
    return o;
  }

  private pad(chunk: Chunk, x: number, t: number) {
    const mesh = new THREE.Mesh(this.padGeo, this.boostMat);
    mesh.position.set(x, 0.02, -t);
    mesh.rotation.y = -trackAngle(t);
    chunk.group.add(mesh);
    chunk.obstacles.push({ kind: 'boost', x, t, hw: 2, hd: 2, h: 0.1, alive: true, mesh });
  }

  private ramp(chunk: Chunk, x: number, t: number) {
    const mesh = new THREE.Mesh(this.rampGeo, this.rampMat);
    mesh.position.set(x, 0, -t);
    chunk.group.add(mesh);
    // obstacle t is the ramp START; hd = full length
    chunk.obstacles.push({ kind: 'ramp', x, t, hw: RAMP_W / 2, hd: RAMP_LEN, h: RAMP_H, alive: true, mesh });
  }

  private gate(t: number, chunk: Chunk): Gate {
    const g = new THREE.Group();
    const c = xc(t), R = TRACK.roadHalf;
    const B = this.B, m = new THREE.Matrix4();
    const pillar = new THREE.InstancedMesh(B.geo.glowstone, B.glow, 16);
    let n = 0;
    for (const side of [-1, 1]) for (let y = 0; y < 7; y++) pillar.setMatrixAt(n++, m.makeTranslation(side * (R + 1.5), y + 0.5, 0));
    pillar.count = n;
    g.add(pillar);
    const idx = Math.round(t / RACE.checkpointEvery);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * R + 4, 1.6), new THREE.MeshBasicMaterial({ map: bannerTexture(`CHECKPOINT ${idx}`), side: THREE.DoubleSide }));
    banner.position.set(0, 6.4, 0);
    g.add(banner);
    g.position.set(c, 0, -t);
    g.rotation.y = -trackAngle(t);
    chunk.group.add(g);
    return { t, index: idx, passed: false, group: g };
  }

  static RAMP = { len: RAMP_LEN, w: RAMP_W, h: RAMP_H };
}
