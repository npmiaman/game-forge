/**
 * Budget-based spawn director: difficulty that ramps smoothly, with waves and boss beats.
 *
 *   const dir = new Director({
 *     waveLength: 25, budget: (wave, t) => 2 + wave * 0.8,
 *     spawns: [
 *       { id: 'grunt', cost: 1, weight: 10, from: 1, group: [3, 6] },
 *       { id: 'tank',  cost: 6, weight: 2,  from: 4 },
 *     ],
 *     onSpawn: (id, count) => spawnPack(id, count),
 *     onWave: (wave) => banner(`WAVE ${wave}`),
 *   });
 *   each frame: dir.update(dt, aliveCount)
 *   dir.hold = true  // pause the wave clock (e.g. during a boss fight)
 */
import { rng } from './rng';

export interface SpawnDef { id: string; cost: number; weight: number; from?: number; until?: number; group?: [number, number] }
export interface DirectorOpts {
  waveLength: number;
  budget: (wave: number, time: number) => number;  // spawn points per second
  spawns: SpawnDef[];
  maxAlive?: number;
  startBudget?: number;
  onSpawn: (id: string, count: number) => void;
  onWave?: (wave: number) => void;
}

export class Director {
  wave = 1; time = 0; waveT = 0; bank: number; hold = false; budgetScale = 1;
  constructor(private o: DirectorOpts) { this.bank = o.startBudget ?? 3; }
  update(dt: number, alive: number) {
    this.time += dt;
    if (!this.hold && (this.waveT += dt) >= this.o.waveLength) { this.waveT = 0; this.wave++; this.o.onWave?.(this.wave); }
    this.bank += this.o.budget(this.wave, this.time) * this.budgetScale * dt;
    if (alive >= (this.o.maxAlive ?? 250)) return;
    const pool = this.o.spawns.filter((s) => (s.from ?? 1) <= this.wave && this.wave <= (s.until ?? Infinity));
    if (!pool.length) return;
    const s = rng.weighted(pool.map((p) => [p, p.weight] as const));
    const n = s.group ? rng.int(s.group[0], s.group[1]) : 1;
    if (this.bank < s.cost * n) return;
    this.bank -= s.cost * n;
    this.o.onSpawn(s.id, n);
  }
  /** 0..1 progress through the current wave */
  get progress() { return this.waveT / this.o.waveLength; }
}
