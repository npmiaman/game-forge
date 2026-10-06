/** Seedable RNG (mulberry32). Use a seed for daily challenges / reproducible levels. */
export class Rng {
  private s: number;
  constructor(seed: number | string = Date.now()) {
    this.s = typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703) >>> 0 : seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number) { return lo + (hi - lo) * this.next(); }
  int(lo: number, hiInclusive: number) { return Math.floor(this.range(lo, hiInclusive + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  /** Weighted pick: weighted([['common', 10], ['rare', 1]]) */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0; for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [v, w] of items) { if ((r -= w) < 0) return v; }
    return items[items.length - 1][0];
  }
}
export const rng = new Rng();
/** Today's date as a seed — same level for everyone today. */
export const dailySeed = () => new Date().toISOString().slice(0, 10);
