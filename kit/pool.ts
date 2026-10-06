/**
 * Object pool for things you spawn a lot (bullets, enemies, particles-as-sprites).
 *   const bullets = new Pool(() => new Bullet(scene));
 *   const b = bullets.get(); b.alive = true; ...
 *   bullets.each((b) => update(b));        // only alive items
 */
export class Pool<T extends { alive: boolean }> {
  readonly items: T[] = [];
  constructor(private make: () => T) {}
  /** Returns a dead item for reuse (or a fresh one). Caller sets alive = true. */
  get(): T {
    for (let i = 0; i < this.items.length; i++) if (!this.items[i].alive) return this.items[i];
    const o = this.make(); this.items.push(o); return o;
  }
  each(fn: (o: T) => void) { for (let i = 0; i < this.items.length; i++) { const o = this.items[i]; if (o.alive) fn(o); } }
  count() { let n = 0; for (const o of this.items) if (o.alive) n++; return n; }
  *alive() { for (const o of this.items) if (o.alive) yield o; }
}
