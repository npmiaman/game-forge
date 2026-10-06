/**
 * Uniform-grid spatial hash for fast "who is near me" queries — separation/flocking,
 * area damage, nearest-target. Rebuild once per frame, then query many times.
 */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(public cellSize = 64) {}
  private key(cx: number, cy: number) { return (cx + 32768) * 65536 + (cy + 32768); }
  clear() { this.cells.clear(); }
  insert(o: T) {
    const k = this.key(Math.floor(o.x / this.cellSize), Math.floor(o.y / this.cellSize));
    let c = this.cells.get(k); if (!c) this.cells.set(k, (c = [])); c.push(o);
  }
  rebuild(items: Iterable<T>) { this.clear(); for (const o of items) this.insert(o); }
  /** Calls fn for every item within radius r of (x,y). */
  query(x: number, y: number, r: number, fn: (o: T, d2: number) => void) {
    const cs = this.cellSize, r2 = r * r;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.cells.get(this.key(cx, cy)); if (!c) continue;
      for (const o of c) { const d2 = (o.x - x) ** 2 + (o.y - y) ** 2; if (d2 <= r2) fn(o, d2); }
    }
  }
  nearest(x: number, y: number, maxR: number, filter?: (o: T) => boolean): T | null {
    let best: T | null = null, bd = Infinity;
    this.query(x, y, maxR, (o, d2) => { if (d2 < bd && (!filter || filter(o))) { bd = d2; best = o; } });
    return best;
  }
}
