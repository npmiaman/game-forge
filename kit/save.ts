/** Namespaced localStorage that never throws (private mode, blocked storage, etc). */
export function store<T extends object>(namespace: string, defaults: T) {
  const key = `save:${namespace}`;
  let data: T = { ...defaults };
  try { const raw = localStorage.getItem(key); if (raw) data = { ...defaults, ...JSON.parse(raw) }; } catch {}
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(data)); } catch {} };
  return {
    get data() { return data; },
    get<K extends keyof T>(k: K): T[K] { return data[k]; },
    set<K extends keyof T>(k: K, v: T[K]) { data[k] = v; persist(); },
    /** Sets only if higher; returns true when it's a new record. */
    best<K extends keyof T>(k: K, v: number) {
      if (typeof data[k] === 'number' && v <= (data[k] as number)) return false;
      (data[k] as unknown as number) = v; persist(); return true;
    },
    reset() { data = { ...defaults }; persist(); },
  };
}
