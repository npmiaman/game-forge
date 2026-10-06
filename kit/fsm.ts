/**
 * Tiny state machine for AI, player states, game phases.
 *
 *   const ai = new Fsm<'idle' | 'chase' | 'attack'>('idle', {
 *     idle:   { update: (dt, t) => { if (seesPlayer) ai.go('chase'); } },
 *     chase:  { enter: () => sfx.play('blip'), update: (dt) => {...} },
 *     attack: { enter: () => {...}, update: (dt, t) => { if (t > 0.5) ai.go('idle'); } },
 *   });
 *   each frame: ai.update(dt)      // t = seconds spent in the current state
 */
export interface StateDef { enter?: () => void; exit?: () => void; update?: (dt: number, t: number) => void }

export class Fsm<S extends string> {
  t = 0;
  prev: S | null = null;
  constructor(public state: S, private defs: Partial<Record<S, StateDef>>) { defs[state]?.enter?.(); }
  go(next: S) {
    if (next === this.state) return;
    this.defs[this.state]?.exit?.();
    this.prev = this.state; this.state = next; this.t = 0;
    this.defs[next]?.enter?.();
  }
  is(...s: S[]) { return s.includes(this.state); }
  update(dt: number) { this.t += dt; this.defs[this.state]?.update?.(dt, this.t); }
}
