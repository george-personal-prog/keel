/**
 * Loadable-weight rounding.
 *
 * Every load the engine prescribes passes through `roundLoad`, so the user never sees
 * a number they cannot actually put on the bar / pick off the rack.
 */

import type { EquipmentSettings, LoadType, Movement } from './types';

export type RoundMode = 'nearest' | 'down' | 'up';

const UNIT = 0.25; // kg resolution for plate maths
const MAX_SIDE_KG = 250;

const sideCache = new Map<string, { reachable: boolean[]; prev: Int32Array }>();

/** Min-plate-count DP over per-side loads, memoised per plate set. */
function sideTable(plates: number[]) {
  const key = plates.join(',');
  const cached = sideCache.get(key);
  if (cached) return cached;
  const n = Math.round(MAX_SIDE_KG / UNIT);
  const units = plates.map((p) => Math.round(p / UNIT));
  const best = new Int32Array(n + 1).fill(1e9);
  const prev = new Int32Array(n + 1).fill(-1);
  best[0] = 0;
  for (let v = 1; v <= n; v++) {
    for (const u of units) {
      if (u <= v && best[v - u] + 1 < best[v]) {
        best[v] = best[v - u] + 1;
        prev[v] = u;
      }
    }
  }
  const reachable = Array.from(best, (b) => b < 1e9);
  const table = { reachable, prev };
  sideCache.set(key, table);
  return table;
}

export function barKgFor(movement: Movement, eq: EquipmentSettings): number {
  return eq.barKgByMovement[movement.id] ?? movement.barKg ?? eq.defaultBarKg;
}

function roundBarbell(target: number, bar: number, plates: number[], mode: RoundMode): number {
  const { reachable } = sideTable(plates);
  const side = (target - bar) / 2;
  if (side <= 0) return bar;
  const exact = side / UNIT;
  let lo = Math.min(Math.floor(exact + 1e-9), reachable.length - 1);
  while (lo > 0 && !reachable[lo]) lo--;
  let hi = Math.ceil(exact - 1e-9);
  while (hi < reachable.length - 1 && !reachable[hi]) hi++;
  if (hi >= reachable.length || !reachable[hi]) hi = lo;
  const pickUnits =
    mode === 'down' ? lo : mode === 'up' ? hi : exact - lo <= hi - exact ? lo : hi; // ties go down
  return bar + 2 * pickUnits * UNIT;
}

/** Plates per side, largest first, for a barbell total. */
export function platesPerSide(totalKg: number, bar: number, plates: number[]): number[] {
  const { reachable, prev } = sideTable(plates);
  let v = Math.round((totalKg - bar) / 2 / UNIT);
  if (v <= 0 || !reachable[v]) return [];
  const out: number[] = [];
  while (v > 0) {
    out.push(prev[v] * UNIT);
    v -= prev[v];
  }
  return out.sort((a, b) => b - a);
}

function roundStep(target: number, step: number, min: number, max: number, mode: RoundMode): number {
  const k = (target - min) / step;
  const r = mode === 'down' ? Math.floor(k + 1e-9) : mode === 'up' ? Math.ceil(k - 1e-9) : Math.ceil(k - 0.5 - 1e-9);
  return Math.min(max, Math.max(min, min + r * step));
}

function roundToList(target: number, list: number[], mode: RoundMode): number {
  const sorted = [...list].sort((a, b) => a - b);
  if (mode === 'down') return [...sorted].reverse().find((x) => x <= target + 1e-9) ?? sorted[0];
  if (mode === 'up') return sorted.find((x) => x >= target - 1e-9) ?? sorted[sorted.length - 1];
  return sorted.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), sorted[0]);
}

/**
 * Round a target load to something loadable for this movement.
 * Returns null for pure bodyweight / erg / unloaded movements.
 * For weighted-bodyweight movements the value is the *added* load (>= 0).
 */
export function roundLoad(
  target: number,
  movement: Movement,
  eq: EquipmentSettings,
  mode: RoundMode = 'nearest',
): number | null {
  return roundLoadType(target, movement.loadType, eq, mode, barKgFor(movement, eq));
}

export function roundLoadType(
  target: number,
  loadType: LoadType,
  eq: EquipmentSettings,
  mode: RoundMode = 'nearest',
  bar = eq.defaultBarKg,
): number | null {
  switch (loadType) {
    case 'barbell':
      return roundBarbell(target, bar, eq.platesKg, mode);
    case 'dumbbell':
      return roundStep(target, eq.dumbbellStepKg, eq.dumbbellMinKg, eq.dumbbellMaxKg, mode);
    case 'kettlebell':
      return roundToList(target, eq.kettlebellsKg, mode);
    case 'cable':
      return roundStep(target, eq.cableStepKg, eq.cableStepKg, 200, mode);
    case 'machine':
      return roundStep(target, eq.machineStepKg, eq.machineStepKg, 400, mode);
    case 'plate-loaded': {
      const step = 2 * Math.min(...eq.platesKg);
      return roundStep(Math.max(0, target), step, 0, 400, mode);
    }
    case 'weighted-bodyweight':
      return roundStep(Math.max(0, target), eq.beltStepKg, 0, 100, mode);
    default:
      return null;
  }
}

/** The next loadable weight strictly above (dir=+1) or below (dir=-1) `load`. */
export function stepLoad(load: number, movement: Movement, eq: EquipmentSettings, dir: 1 | -1): number {
  const tiny = 0.01;
  const r = roundLoad(load + dir * tiny, movement, eq, dir === 1 ? 'up' : 'down');
  return r ?? load;
}

/** Smallest increment available at this load. */
export function smallestIncrement(load: number, movement: Movement, eq: EquipmentSettings): number {
  return Math.max(0, stepLoad(load, movement, eq, 1) - load);
}

export function isLoaded(movement: Movement): boolean {
  return !['bodyweight', 'erg', 'none'].includes(movement.loadType);
}
