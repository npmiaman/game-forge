/**
 * Roguelite upgrade picker: "choose 1 of 3" with weights, max levels and prerequisites.
 *
 *   const ups = new Upgrades([
 *     { id: 'rate', name: 'Overclock', desc: '+20% fire rate', max: 5, weight: 10, apply: (s) => (s.fireRate *= 1.2) },
 *     { id: 'pierce', name: 'Pierce', desc: '+1 pierce', max: 3, weight: 5, requires: ['rate'], apply: (s) => s.pierce++ },
 *   ]);
 *   const choices = ups.offer(3);        // Upgrade[] (respects max + requires)
 *   ups.take('rate', stats);             // applies + tracks level
 *   ups.level('rate')                    // how many owned
 */
import { rng } from './rng';

export interface Upgrade<S> { id: string; name: string; desc: string; max: number; weight: number; requires?: string[]; apply: (stats: S) => void; [extra: string]: unknown }

export class Upgrades<S> {
  owned: Record<string, number> = {};
  constructor(public all: Upgrade<S>[]) {}
  level(id: string) { return this.owned[id] ?? 0; }
  available() { return this.all.filter((u) => this.level(u.id) < u.max && (u.requires ?? []).every((r) => this.level(r) > 0)); }
  offer(n = 3): Upgrade<S>[] {
    const pool = this.available(), out: Upgrade<S>[] = [];
    while (out.length < n && out.length < pool.length) {
      const left = pool.filter((u) => !out.includes(u));
      out.push(rng.weighted(left.map((u) => [u, u.weight] as const)));
    }
    return out;
  }
  take(id: string, stats: S) {
    const u = this.all.find((x) => x.id === id);
    if (!u) throw new Error(`unknown upgrade ${id}`);
    u.apply(stats);
    this.owned[id] = this.level(id) + 1;
    return u;
  }
}
