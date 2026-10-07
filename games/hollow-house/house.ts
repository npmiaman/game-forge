/**
 * The house: an ASCII map → 3D rooms, doors, furniture, hiding spots, items.
 *   # wall   . floor   D door   E front door (exit)   W wardrobe (hide)   B bed (hide under)
 *   T furniture   P player start   G Grandma start   S zombie spawn   K key spot   H medkit spot   A battery spot
 * One cell = CELL metres. Cell (cx, cy) → world (cx*CELL + CELL/2, *, cy*CELL + CELL/2).
 */
import * as THREE from 'three';
import { Grid, type P } from '@kit/grid';
import { CELL, WALL_H } from './config';
import { loadModel, loadTexture, sizeOf } from '@kit/assets';

export const MAP = [
  '##############################',
  '#B...W#.T......T.#W...B#.H...#',
  '#.....#..........#.....#.....#',
  '#..P..#...TT.....D.....#..T..#',
  '#K....#...TT..K..#..K..#.....#',
  '#.....#..........#.....#..A..#',
  '###D#####D##########D#####D###',
  '#............................#',
  '#..S......................S..#',
  '######D#######D#######D#######',
  '#T..........#........#B....W.#',
  '#...........#..TTTT..#.......#',
  '#...TTT.....D..TTTT..D...G...#',
  '#...TTT..K..#........#.....K.#',
  '#H..........#.T....A.#.......#',
  '#.....S.....#........#T....T.#',
  '######E#######################',
];

export const ROOMS: { name: string; x0: number; y0: number; x1: number; y1: number }[] = [
  { name: 'Your bedroom', x0: 1, y0: 1, x1: 5, y1: 5 }, { name: 'Study', x0: 7, y0: 1, x1: 16, y1: 5 },
  { name: 'Guest room', x0: 18, y0: 1, x1: 22, y1: 5 }, { name: 'Bathroom', x0: 24, y0: 1, x1: 28, y1: 5 },
  { name: 'Hallway', x0: 1, y0: 7, x1: 28, y1: 8 }, { name: 'Living room', x0: 1, y0: 10, x1: 11, y1: 15 },
  { name: 'Kitchen', x0: 13, y0: 10, x1: 20, y1: 15 }, { name: "Grandma's room", x0: 22, y0: 10, x1: 28, y1: 15 },
];

export const toWorld = (c: P) => ({ x: c.x * CELL + CELL / 2, z: c.y * CELL + CELL / 2 });
export const toCell = (x: number, z: number): P => ({ x: Math.floor(x / CELL), y: Math.floor(z / CELL) });

// ---------------------------------------------------------------- procedural textures
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
const noise = (g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, dark = true) => {
  for (let i = 0; i < n; i++) { g.fillStyle = dark ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,255,255,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
};
const wallpaper = () => canvasTex(128, 192, (g) => {
  g.fillStyle = '#6b5a45'; g.fillRect(0, 0, 128, 192);
  for (let x = 0; x < 128; x += 32) { g.fillStyle = '#5a4a38'; g.fillRect(x, 0, 12, 192); }
  for (let y = 10; y < 192; y += 40) for (let x = 22; x < 128; x += 32) { g.fillStyle = '#7d6a50'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  g.fillStyle = '#3a2c20'; g.fillRect(0, 170, 128, 22);            // skirting board
  noise(g, 128, 192, 900, 0.25);
  for (let i = 0; i < 4; i++) { const x = Math.random() * 128, y = Math.random() * 120; const gr = g.createRadialGradient(x, y, 2, x, y, 20 + Math.random() * 20); gr.addColorStop(0, 'rgba(40,30,10,.35)'); gr.addColorStop(1, 'rgba(40,30,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 192); }
});
const floorTex = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#4a3322'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { g.fillStyle = y % 32 ? '#53392a' : '#4a3424'; g.fillRect(0, y, 128, 15); g.fillStyle = '#2a1c12'; g.fillRect(0, y + 15, 128, 1); g.fillRect((y * 37) % 128, y, 1, 16); }
  noise(g, 128, 128, 700, 0.3);
}, 1);
const ceilTex = () => canvasTex(64, 64, (g) => { g.fillStyle = '#4c4840'; g.fillRect(0, 0, 64, 64); noise(g, 64, 64, 300, 0.2); });
const woodTex = (base = '#5a3a22') => canvasTex(64, 64, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 3) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(x, 0, 1, 64); }
  noise(g, 64, 64, 200, 0.2);
});
const doorTex = (base: string) => canvasTex(64, 128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.strokeRect(8, 8, 48, 50); g.strokeRect(8, 68, 48, 52);
  g.fillStyle = '#b89a4a'; g.fillRect(52, 62, 6, 6);
  noise(g, 64, 128, 300, 0.25);
});

// ---------------------------------------------------------------- house object

export interface Door { cell: P; open: number; target: number; pivot: THREE.Group; along: 'x' | 'z'; exit: boolean; locks?: THREE.Mesh[] }
export interface HideSpot { cell: P; kind: 'wardrobe' | 'bed'; front: P; mesh: THREE.Object3D }

export class House {
  grid = Grid.fromAscii(MAP);
  doors = new Map<string, Door>();
  hides: HideSpot[] = [];
  spots: Record<'P' | 'G' | 'S' | 'K' | 'H' | 'A', P[]> = { P: [], G: [], S: [], K: [], H: [], A: [] };
  root = new THREE.Group();
  lights: THREE.PointLight[] = [];
  private floorMat!: THREE.MeshStandardMaterial; private ceilMat!: THREE.MeshStandardMaterial; private wallMat!: THREE.MeshStandardMaterial;
  private placeholders: THREE.Object3D[] = [];
  private bulbs: { x: number; z: number }[] = [];
  key = (c: P) => `${c.x},${c.y}`;

  constructor(scene: THREE.Scene) {
    const g = this.grid;
    for (const k of Object.keys(this.spots) as (keyof House['spots'])[]) this.spots[k] = g.findAll(k);
    const W = g.w * CELL, H = g.h * CELL;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), (this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.8 })));
    (floor.material as THREE.MeshStandardMaterial).map!.repeat.set(g.w / 2, g.h / 2);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), (this.ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex(), roughness: 1 })));
    (ceil.material as THREE.MeshStandardMaterial).map!.repeat.set(g.w, g.h);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, WALL_H, H / 2);
    this.root.add(floor, ceil);

    // walls
    const wallCells = g.findAll('#');
    const wallMat = (this.wallMat = new THREE.MeshStandardMaterial({ map: wallpaper(), roughness: 0.9 }));
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallMat, wallCells.length);
    const m = new THREE.Matrix4();
    wallCells.forEach((c, i) => { const w = toWorld(c); walls.setMatrixAt(i, m.makeTranslation(w.x, WALL_H / 2, w.z)); });
    walls.castShadow = walls.receiveShadow = true;
    this.root.add(walls);

    // doors (+ lintel above the opening)
    const lintelGeo = new THREE.BoxGeometry(CELL, 0.4, CELL);
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex('#4a2f1c'), roughness: 0.7 });
    const exitMat = new THREE.MeshStandardMaterial({ map: doorTex('#6b1d1d'), roughness: 0.6 });
    for (const c of [...g.findAll('D'), ...g.findAll('E')]) {
      const w = toWorld(c), exit = g.get(c.x, c.y) === 'E';
      const lintel = new THREE.Mesh(lintelGeo, wallMat); lintel.position.set(w.x, WALL_H - 0.2, w.z); this.root.add(lintel);
      const along: 'x' | 'z' = g.get(c.x - 1, c.y) === '#' ? 'x' : 'z';
      const pivot = new THREE.Group();
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.1, WALL_H - 0.4, 0.12), exit ? exitMat : doorMat);
      leaf.castShadow = true;
      leaf.position.set((CELL - 0.1) / 2, (WALL_H - 0.4) / 2, 0);
      pivot.add(leaf);
      if (along === 'x') pivot.position.set(w.x - CELL / 2 + 0.05, 0, w.z);
      else { pivot.position.set(w.x, 0, w.z - CELL / 2 + 0.05); pivot.rotation.y = -Math.PI / 2; }
      const door: Door = { cell: c, open: 0, target: 0, pivot, along, exit };
      if (exit) {
        door.locks = [0xff3333, 0x3399ff, 0xffcc33].map((col, i) => {
          const lk = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.08), new THREE.MeshBasicMaterial({ color: col }));
          lk.position.set(CELL - 0.45, 0.9 + i * 0.3, -0.1); leaf.add(lk); return lk;
        });
      }
      (pivot as any).baseRot = pivot.rotation.y;
      this.root.add(pivot);
      this.doors.set(this.key(c), door);
    }

    // furniture
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.75 });
    const darkWood = new THREE.MeshStandardMaterial({ map: woodTex('#3a2414'), roughness: 0.7 });
    const sheet = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1 });
    const pillow = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b;
    };
    const facing = (c: P): P => { for (const d of [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]) if (g.get(c.x + d.x, c.y + d.y) === '.') return { x: c.x + d.x, y: c.y + d.y }; return c; };
    for (const c of g.findAll('T')) { const w = toWorld(c); const h = 0.8 + ((c.x * 7 + c.y * 3) % 3) * 0.35; this.placeholders.push(box(CELL * 0.9, h, CELL * 0.9, wood, w.x, h / 2, w.z)); }
    for (const c of g.findAll('W')) {
      const w = toWorld(c), f = facing(c);
      const grp = new THREE.Group(); grp.position.set(w.x, 0, w.z); grp.rotation.y = Math.atan2(f.x - c.x, f.y - c.y);
      box(1.7, 2.5, 1.2, darkWood, 0, 1.25, 0, grp);
      box(0.04, 2.2, 0.02, new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 1.25, 0.61, grp);  // door gap line
      this.root.add(grp); this.placeholders.push(grp);
      this.hides.push({ cell: c, kind: 'wardrobe', front: f, mesh: grp });
    }
    for (const c of g.findAll('B')) {
      const w = toWorld(c), f = facing(c);
      const grp = new THREE.Group(); grp.position.set(w.x, 0, w.z); grp.rotation.y = Math.atan2(f.x - c.x, f.y - c.y);
      box(1.8, 0.15, 1.9, darkWood, 0, 0.55, 0, grp);
      box(1.7, 0.2, 1.8, sheet, 0, 0.72, 0, grp);
      box(0.9, 0.15, 0.4, pillow, 0, 0.88, -0.6, grp);
      for (const [lx, lz] of [[-0.8, -0.85], [0.8, -0.85], [-0.8, 0.85], [0.8, 0.85]]) box(0.12, 0.5, 0.12, darkWood, lx, 0.25, lz, grp);
      this.root.add(grp); this.placeholders.push(grp);
      this.hides.push({ cell: c, kind: 'bed', front: f, mesh: grp });
    }

    // a few weak flickering bulbs
    for (const [cx, cy] of [[8, 7], [21, 8], [16, 12], [6, 12], [25, 12]]) {
      const l = new THREE.PointLight(0xffb070, 4, 9, 1.6);
      const w = toWorld({ x: cx, y: cy }); l.position.set(w.x, WALL_H - 0.3, w.z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      bulb.position.copy(l.position);
      this.root.add(l, bulb);
      this.lights.push(l); this.bulbs.push(w);
    }
    scene.add(this.root);
  }

  /**
   * Upgrade the placeholder house with the asset library: photoreal surfaces (Poly Haven) and real
   * furniture (Kenney furniture-kit) chosen per room. Collision is unchanged — it's still cell-based.
   */
  async dress() {
    const g = this.grid;
    const [floorT, wallT, ceilT] = await Promise.all([
      loadTexture('wood_floor_worn', { repeat: [g.w / 1.5, g.h / 1.5] }),
      loadTexture('decrepit_wallpaper', { repeat: [1, 1.5] }),
      loadTexture('painted_plaster_wall', { repeat: [g.w / 2, g.h / 2] }),
    ]);
    Object.assign(this.floorMat, floorT, { color: new THREE.Color(0x9a8a7a) }); this.floorMat.needsUpdate = true;
    Object.assign(this.wallMat, wallT, { color: new THREE.Color(0xa89880) }); this.wallMat.needsUpdate = true;
    Object.assign(this.ceilMat, ceilT, { color: new THREE.Color(0x6a6458) }); this.ceilMat.needsUpdate = true;

    const facing = (c: P): P => { for (const d of [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]) { const ch = g.get(c.x + d.x, c.y + d.y); if (ch && '.KHASPG'.includes(ch)) return { x: c.x + d.x, y: c.y + d.y }; } return { x: c.x, y: c.y + 1 }; };
    const place = async (id: string, cx: number, cz: number, faceTo: P | null, o: { w?: number; d?: number; h?: number; y?: number; stretch?: boolean } = {}) => {
      const m = await loadModel(`furniture-kit/${id}`);
      const sz = sizeOf(m);
      const w = o.w ?? CELL * 0.92, d = o.d ?? CELL * 0.92;
      let rot = 0;
      if (faceTo) rot = Math.atan2(faceTo.x * CELL + CELL / 2 - cx, faceTo.y * CELL + CELL / 2 - cz);
      const sideways = Math.abs(Math.sin(rot)) > 0.7;
      const fw = sideways ? d : w, fd = sideways ? w : d;
      if (o.stretch) m.scale.set(fw / sz.x, (o.h ?? sz.y) / sz.y, fd / sz.z);
      else { const k = Math.min(1.35, fw / sz.x, fd / sz.z, o.h ? o.h / sz.y : Infinity); m.scale.setScalar(k); }
      m.rotation.y = rot;
      m.position.set(cx, o.y ?? 0, cz);
      this.root.add(m);
      return m;
    };
    const jobs: Promise<unknown>[] = [];
    // furniture blocks: group connected 'T' cells, pick models by room and block size
    const seen = new Set<string>();
    for (const c of g.findAll('T')) {
      if (seen.has(this.key(c))) continue;
      const comp: P[] = []; const q = [c]; seen.add(this.key(c));
      while (q.length) { const p = q.pop()!; comp.push(p); for (const n of g.neighbors(p.x, p.y)) if (g.get(n.x, n.y) === 'T' && !seen.has(this.key(n))) { seen.add(this.key(n)); q.push(n); } }
      const xs = comp.map((p) => p.x), ys = comp.map((p) => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
      const cx = ((x0 + x1) / 2) * CELL, cz = ((y0 + y1) / 2) * CELL, bw = (x1 - x0) * CELL, bd = (y1 - y0) * CELL;
      const room = this.roomAt(c), front = comp.length === 1 ? facing(c) : null;
      if (comp.length > 1) {
        if (room === 'Kitchen') {
          jobs.push(place('tableCloth', cx, cz, null, { w: bw * 0.85, d: bd * 0.8, h: 0.8, stretch: true }));
          for (let i = 0; i < 3; i++) for (const side of [-1, 1]) jobs.push(place('chairCushion', x0 * CELL + (i + 0.7) * (bw / 3), cz + side * (bd / 2 + 0.05), { x: Math.floor(cx / CELL), y: Math.floor(cz / CELL) }, { w: 0.6, d: 0.6 }));
        } else if (room === 'Study') {
          jobs.push(place('desk', cx, cz, null, { w: bw * 0.8, d: bd * 0.55, h: 0.8, stretch: true }));
          jobs.push(place('computerScreen', cx, cz - 0.3, null, { w: 0.7, d: 0.4, y: 0.8 }));
          jobs.push(place('books', cx + 0.9, cz + 0.2, null, { w: 0.5, d: 0.3, y: 0.8 }));
          jobs.push(place('lampRoundTable', cx - 1.1, cz - 0.2, null, { w: 0.4, d: 0.4, y: 0.8 }));
        } else {
          jobs.push(place('loungeSofaLong', cx, z0(cz, bd), null, { w: bw * 0.95, d: bd * 0.45 }));
          jobs.push(place('tableCoffee', cx, cz + bd * 0.2, null, { w: bw * 0.5, d: bd * 0.3 }));
        }
        continue;
      }
      const w = toWorld(c);
      const byRoom: Record<string, string[]> = {
        Study: ['bookcaseClosedWide', 'bookcaseOpen'], Bathroom: ['bathtub'], Kitchen: ['kitchenFridgeLarge'],
        'Living room': ['cabinetTelevision'], "Grandma's room": ['sideTableDrawers', 'bookcaseClosed'],
      };
      const list = byRoom[room] ?? ['sideTable'];
      const id = list[(c.x + c.y) % list.length];
      jobs.push(place(id, w.x, w.z, front, { h: id.startsWith('bookcase') || id.startsWith('kitchen') ? 2.2 : undefined }));
      if (id === 'cabinetTelevision') jobs.push(place('televisionVintage', w.x, w.z, front, { w: 1.1, d: 0.6, y: 0.62 }));
      if (id === 'sideTableDrawers') jobs.push(place('lampRoundTable', w.x, w.z, front, { w: 0.5, d: 0.5, y: 0.6 }));
    }
    function z0(cz: number, bd: number) { return cz - bd * 0.25; }
    // hiding spots: real beds and tall closed cupboards ("wardrobes")
    for (const h of this.hides) {
      const w = toWorld(h.cell), room = this.roomAt(h.cell);
      if (h.kind === 'bed') jobs.push(place(room === 'Your bedroom' ? 'bedSingle' : 'bedDouble', w.x, w.z, h.front, { w: 1.9, d: 1.95 }));
      else jobs.push(place('bookcaseClosedDoors', w.x, w.z, h.front, { h: 2.4, w: 1.6, d: 0.9 }));
    }
    // decor that doesn't block anything: rugs on the floor, lamps on the ceiling, a doormat by the exit
    jobs.push(place('rugRectangle', 6 * CELL + 1, 13.5 * CELL, null, { w: 6, d: 4 }));
    jobs.push(place('rugRound', 3.5 * CELL, 3.5 * CELL, null, { w: 3, d: 3 }));
    jobs.push(place('rugRectangle', 20 * CELL, 3 * CELL, null, { w: 3, d: 2.4 }));
    jobs.push(place('rugDoormat', 6.5 * CELL, 15.6 * CELL, null, { w: 1.6, d: 1 }));
    for (const b of this.bulbs) jobs.push(place('lampSquareCeiling', b.x, b.z, null, { w: 0.7, d: 0.7 }).then((m) => { m.position.y = WALL_H - sizeOf(m).y; }));
    await Promise.all(jobs);
    for (const ph of this.placeholders) ph.visible = false;
  }

  door(c: P) { return this.doors.get(this.key(c)); }
  roomAt(c: P) { return ROOMS.find((r) => c.x >= r.x0 && c.x <= r.x1 && c.y >= r.y0 && c.y <= r.y1)?.name ?? ''; }

  /** Blocks movement? */
  solid(cx: number, cy: number) {
    const ch = this.grid.get(cx, cy);
    if (ch === undefined || ch === '#' || ch === 'T' || ch === 'W' || ch === 'B') return true;
    if (ch === 'D' || ch === 'E') return this.door({ x: cx, y: cy })!.open < 0.6;
    return false;
  }
  /** Blocks sight? (tables don't, beds don't) */
  opaque(cx: number, cy: number) {
    const ch = this.grid.get(cx, cy);
    if (ch === undefined || ch === '#' || ch === 'W') return true;
    if (ch === 'D' || ch === 'E') return this.door({ x: cx, y: cy })!.open < 0.4;
    return false;
  }

  /** Line of sight between two world points, sampled along the line. */
  los(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) {
      const c = toCell(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
      if (this.opaque(c.x, c.y)) return false;
    }
    return true;
  }

  /** Circle-vs-grid collision: returns the position pushed out of solid cells. */
  collide(x: number, z: number, r: number) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let iy = cz - 1; iy <= cz + 1; iy++) for (let ix = cx - 1; ix <= cx + 1; ix++) {
      if (!this.solid(ix, iy)) continue;
      const nx = Math.max(ix * CELL, Math.min(x, ix * CELL + CELL)), nz = Math.max(iy * CELL, Math.min(z, iy * CELL + CELL));
      const dx = x - nx, dz = z - nz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) { x = nx + (dx / d) * r; z = nz + (dz / d) * r; }
        else { // centre inside a solid cell: push to nearest edge
          const ox = x - (ix * CELL + CELL / 2), oz = z - (iy * CELL + CELL / 2);
          if (Math.abs(ox) > Math.abs(oz)) x = ix * CELL + (ox > 0 ? CELL + r : -r); else z = iy * CELL + (oz > 0 ? CELL + r : -r);
        }
      }
    }
    return { x, z };
  }

  /** A* path in cells. `opensDoors`: Grandma walks through closed doors (she opens them). */
  path(from: P, to: P, opensDoors: boolean) {
    return this.grid.path(from, to, (ch, x, y) => {
      if (ch === '#' || ch === 'T' || ch === 'W' || ch === 'B') return false;
      if (ch === 'E') return false;
      if (ch === 'D') return opensDoors || this.door({ x, y })!.open > 0.6;
      return true;
    });
  }

  /** Random walkable cell in a random room (patrol targets). */
  randomFloor(rand: () => number) {
    const floors = this.grid.findAll((c) => c === '.' || c === 'K' || c === 'H' || c === 'A' || c === 'S' || c === 'P' || c === 'G');
    return floors[Math.floor(rand() * floors.length)];
  }

  update(dt: number, time: number) {
    for (const d of this.doors.values()) {
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 2.5);
      d.pivot.rotation.y = (d.pivot as any).baseRot + d.open * (Math.PI / 2) * 0.95;
    }
    this.lights.forEach((l, i) => { const f = Math.sin(time * 13 + i * 7) * Math.sin(time * 3.1 + i); l.intensity = f > 0.93 ? 0.3 : 4 + Math.sin(time * 40 + i) * 0.3; });
  }
}
