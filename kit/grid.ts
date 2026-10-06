/**
 * Grids for puzzles, roguelikes, tower defense, tactics, match-3.
 *
 *   const g = Grid.fromAscii(['#####', '#P.$#', '#####']);   // Grid<string>
 *   g.get(x, y); g.set(x, y, '.'); g.inBounds(x, y); g.find('P')
 *   const path = g.path(start, goal, (c) => c !== '#');     // A* → [{x,y}, ...] or null
 *   const dist = g.flood(start, (c) => c !== '#');          // BFS distance field (tower-defense flow fields)
 */
export interface P { x: number; y: number }
export const DIRS4: readonly P[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
export const DIRS8: readonly P[] = [...DIRS4, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }];

export class Grid<T> {
  readonly cells: T[];
  constructor(public w: number, public h: number, fill: T | ((x: number, y: number) => T)) {
    this.cells = Array.from({ length: w * h }, (_, i) => (typeof fill === 'function' ? (fill as (x: number, y: number) => T)(i % w, Math.floor(i / w)) : fill));
  }
  static fromAscii(rows: string[], pad = ' ') {
    const w = Math.max(...rows.map((r) => r.length));
    return new Grid<string>(w, rows.length, (x, y) => rows[y][x] ?? pad);
  }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): T | undefined { return this.inBounds(x, y) ? this.cells[y * this.w + x] : undefined; }
  set(x: number, y: number, v: T) { if (this.inBounds(x, y)) this.cells[y * this.w + x] = v; }
  forEach(fn: (v: T, x: number, y: number) => void) { this.cells.forEach((v, i) => fn(v, i % this.w, Math.floor(i / this.w))); }
  find(pred: T | ((v: T) => boolean)): P | null {
    const i = this.cells.findIndex((v) => (typeof pred === 'function' ? (pred as (v: T) => boolean)(v) : v === pred));
    return i < 0 ? null : { x: i % this.w, y: Math.floor(i / this.w) };
  }
  findAll(pred: T | ((v: T) => boolean)): P[] {
    const out: P[] = [];
    this.forEach((v, x, y) => { if (typeof pred === 'function' ? (pred as (v: T) => boolean)(v) : v === pred) out.push({ x, y }); });
    return out;
  }
  neighbors(x: number, y: number, dirs: readonly P[] = DIRS4) {
    return dirs.map((d) => ({ x: x + d.x, y: y + d.y })).filter((p) => this.inBounds(p.x, p.y));
  }
  clone() { const g = new Grid<T>(this.w, this.h, null as T); g.cells.splice(0, g.cells.length, ...this.cells); return g; }
  toAscii(fn: (v: T) => string = String) { const r: string[] = []; for (let y = 0; y < this.h; y++) r.push(this.cells.slice(y * this.w, (y + 1) * this.w).map(fn).join('')); return r; }

  /** A* shortest path (inclusive of start and goal), or null if unreachable. */
  path(start: P, goal: P, walkable: (v: T, x: number, y: number) => boolean, dirs: readonly P[] = DIRS4): P[] | null {
    const key = (x: number, y: number) => y * this.w + x;
    const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
    const g = new Map<number, number>([[key(start.x, start.y), 0]]);
    const from = new Map<number, number>();
    const open: [number, number, number][] = [[h(start.x, start.y), start.x, start.y]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open.splice(bi, 1)[0];
      if (x === goal.x && y === goal.y) {
        const out: P[] = [{ x, y }]; let k = key(x, y);
        while (from.has(k)) { k = from.get(k)!; out.unshift({ x: k % this.w, y: Math.floor(k / this.w) }); }
        return out;
      }
      for (const d of dirs) {
        const nx = x + d.x, ny = y + d.y;
        if (!this.inBounds(nx, ny) || !walkable(this.get(nx, ny)!, nx, ny)) continue;
        const ng = g.get(key(x, y))! + (d.x && d.y ? 1.414 : 1), nk = key(nx, ny);
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, key(x, y)); open.push([ng + h(nx, ny), nx, ny]); }
      }
    }
    return null;
  }

  /** BFS distance from start to every reachable cell (-1 = unreachable). */
  flood(start: P, walkable: (v: T, x: number, y: number) => boolean, dirs: readonly P[] = DIRS4): Grid<number> {
    const dist = new Grid<number>(this.w, this.h, -1);
    dist.set(start.x, start.y, 0);
    const q: P[] = [start];
    while (q.length) {
      const c = q.shift()!, cd = dist.get(c.x, c.y)!;
      for (const n of this.neighbors(c.x, c.y, dirs)) {
        if (dist.get(n.x, n.y) !== -1 || !walkable(this.get(n.x, n.y)!, n.x, n.y)) continue;
        dist.set(n.x, n.y, cd + 1); q.push(n);
      }
    }
    return dist;
  }
}
