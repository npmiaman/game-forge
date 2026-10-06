/**
 * Live tuning panel — tweak numbers while the game runs, no reload.
 * Shows only when the URL has ?tune (so it never ships by accident).
 *
 *   import { tune } from '@kit/tune';
 *   tune(PLAYER, 'Player');                 // every number/boolean/colour-string becomes a control
 *   tune(DIRECTOR, 'Spawns', { budgetPerWave: [0, 3] });   // optional [min, max] per key
 *
 * Values are edited in place on the object you pass, so code that reads PLAYER.runSpeed
 * every frame picks up changes instantly. "Copy" puts the current values on the clipboard
 * as a TS object — paste it back into config.ts to keep what you found.
 */
import { Pane } from 'tweakpane';

const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('tune');
let pane: Pane | null = null;

function root() {
  if (!pane) {
    pane = new Pane({ title: 'TUNE  (?tune)', expanded: true });
    Object.assign(pane.element.parentElement!.style, { zIndex: '9999', width: '300px', top: '8px', right: '8px' });
  }
  return pane;
}

export function tune<T extends object>(obj: T, title: string, ranges: Partial<Record<keyof T, [number, number]>> = {}) {
  if (!enabled) return;
  const folder = root().addFolder({ title, expanded: true });
  for (const key of Object.keys(obj) as (keyof T & string)[]) {
    const v = obj[key];
    if (typeof v === 'number') {
      const r = ranges[key];
      const span = Math.max(Math.abs(v) * 3, 1);
      folder.addBinding(obj, key, r ? { min: r[0], max: r[1] } : { min: Math.min(0, v * 3), max: v === 0 ? 10 : v < 0 ? 0 : span });
    } else if (typeof v === 'boolean' || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) {
      folder.addBinding(obj, key);
    }
  }
  folder.addButton({ title: 'Copy values' }).on('click', () => {
    const body = Object.entries(obj).filter(([, v]) => typeof v !== 'object' && typeof v !== 'function')
      .map(([k, v]) => `  ${k}: ${typeof v === 'number' ? +v.toFixed(3) : JSON.stringify(v)},`).join('\n');
    navigator.clipboard?.writeText(`{\n${body}\n}`);
  });
}

/** Add a live read-only readout (fps, entity count…): monitor('enemies', () => pool.count()) */
export function monitor(label: string, get: () => number | string) {
  if (!enabled) return;
  const o = { [label]: get() };
  root().addBinding(o, label, { readonly: true, interval: 200 });
  setInterval(() => (o[label] = get()), 200);
}

/** Add a button (spawn boss, skip level, give upgrades…) — only visible with ?tune. */
export function action(title: string, fn: () => void) {
  if (!enabled) return;
  root().addButton({ title }).on('click', fn);
}

export const tuning = enabled;
