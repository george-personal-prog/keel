/** Small pure helpers: dates (ISO strings, UTC-safe), seeded RNG, maths. */

const DAY_MS = 86_400_000;

export function parseDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return new Date(parseDate(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** mulberry32: tiny, fast, deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(items: readonly T[], r: () => number): T {
  return items[Math.floor(r() * items.length) % items.length];
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function fmtKg(kg: number): string {
  return `${Number(kg.toFixed(2))} kg`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
