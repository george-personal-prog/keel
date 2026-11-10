/**
 * Session duration estimates, warm-ups, and fitting a session into a time budget.
 * Estimates are deliberately a little pessimistic (setup, transitions, chalk, plates).
 */

import { barKgFor, roundLoad } from './loading';
import { getMovement } from './movements/library';
import type { ExercisePrescription, PrescribedSet, SessionPrescription, Settings, WarmupPrescription, WodPrescription } from './types';

const SETUP_SEC = 60;
const WOD_OVERHEAD_MIN = 3;

function tempoSecPerRep(tempo?: string): number | undefined {
  if (!tempo) return undefined;
  return tempo.split('').reduce((a, c) => a + (c === 'X' || c === 'x' ? 1 : Number(c) || 0), 0);
}

function workSec(ex: ExercisePrescription, set: PrescribedSet): number {
  const m = getMovement(ex.movementId);
  const perRep = tempoSecPerRep(ex.tempo) ?? m.secPerRep ?? (ex.scheme === 'olympic' ? 5 : 3);
  return Math.max(15, set.reps * perRep);
}

export function exerciseSeconds(exs: ExercisePrescription[]): number {
  let total = 0;
  const groups = new Map<string, ExercisePrescription[]>();
  for (const ex of exs) {
    const key = ex.group ? ex.group.replace(/\d+$/, '') : `solo:${ex.slotKey}`;
    groups.set(key, [...(groups.get(key) ?? []), ex]);
  }
  for (const members of groups.values()) {
    const rounds = Math.max(...members.map((m) => m.sets.length));
    const rest = Math.max(...members.map((m) => m.restSec));
    for (let r = 0; r < rounds; r++) {
      for (const m of members) {
        const set = m.sets[r];
        if (set) total += workSec(m, set) + (members.length > 1 ? 20 : 0);
      }
      if (r < rounds - 1) total += rest;
    }
    total += SETUP_SEC * members.length;
    // Calibration: extra build-up sets to find the load (heavier lifts need more).
    for (const m of members) if (m.calibrating) total += m.scheme === 'hypertrophy' ? 60 : 180;
  }
  return total;
}

export function conditioningMinutes(w?: WodPrescription): number {
  return w ? w.durationMin + WOD_OVERHEAD_MIN : 0;
}

export function estimateMinutes(p: Pick<SessionPrescription, 'exercises' | 'conditioning' | 'warmup'>): number {
  return Math.round(p.warmup.minutes + exerciseSeconds(p.exercises) / 60 + conditioningMinutes(p.conditioning));
}

export function restFor(ex: Pick<ExercisePrescription, 'scheme' | 'role' | 'group' | 'movementId'>): number {
  const m = getMovement(ex.movementId);
  const iso = m.tags.includes('isolation');
  let rest: number;
  if (ex.scheme === 'strength') rest = ex.role === 'primary' ? 180 : 150;
  else if (ex.scheme === 'olympic') rest = 90;
  else if (iso) rest = 75;
  else rest = ex.role === 'primary' ? 150 : 120;
  // In a superset the partner's set uses part of the rest.
  return ex.group ? Math.max(60, Math.round(rest * 0.75)) : rest;
}

// --------------------------------------------------------------------------- warm-up

export function buildWarmup(first: ExercisePrescription | undefined, settings: Settings, region: string): WarmupPrescription {
  const general: WarmupPrescription = {
    style: 'general',
    minutes: 5,
    steps:
      region === 'lower'
        ? ['3 min easy bike or row', '2 rounds: 10 air squats, 5 inchworms, 10 glute bridges']
        : region === 'upper'
          ? ['3 min easy row or ski', '2 rounds: 15 band pull-aparts, 10 scap push-ups, 5 inchworms']
          : ['3 min easy erg', '2 rounds: 10 air squats, 10 band pull-aparts, 5 inchworms'],
  };
  if (settings.warmupStyle === 'general' || !first) return general;

  const m = getMovement(first.movementId);
  const top = first.sets.find((s) => s.loadKg != null)?.loadKg;
  if (first.calibrating || top == null) {
    if (first.calibrating && m.loadType !== 'bodyweight') {
      return { style: 'ramp', minutes: 3, steps: ['2 min easy erg', `Your build-up sets on ${m.name} are the warm-up`] };
    }
    return general;
  }

  const eq = settings.equipment;
  const bar = m.loadType === 'barbell' ? barKgFor(m, eq) : 0;
  const ramp: PrescribedSet[] = [];
  if (m.loadType === 'barbell') ramp.push({ kind: 'warmup', loadKg: bar, reps: 8, targetRir: 5 });
  // Minimal ramp: empty bar (barbell only) + up to three jumps.
  const steps: [number, number][] = m.loadType === 'barbell' ? [[0.5, 5], [0.7, 3], [0.85, 1]] : [[0.5, 6], [0.75, 3]];
  for (const [p, reps] of steps) {
    const load = roundLoad(top * p, m, eq, 'nearest');
    if (load == null || load <= bar || ramp.some((s) => s.loadKg === load)) continue;
    if (load >= top) continue;
    ramp.push({ kind: 'warmup', loadKg: load, reps, targetRir: 5 });
  }
  return {
    style: 'ramp',
    minutes: Math.round(1.5 + ramp.length),
    steps: ['2 min easy erg', `Ramp sets on ${m.name}`],
    rampSets: ramp,
  };
}

// --------------------------------------------------------------------------- budget fitting

export interface FitOptions {
  budgetMin: number;
  conditioningPriority: number;
  conditioningMinMinutes?: number;
  rebuildConditioning?: (minutes: number) => WodPrescription;
}

function dropLastNonTopSet(ex: ExercisePrescription): ExercisePrescription {
  let idx = -1;
  ex.sets.forEach((s, i) => {
    if (s.kind !== 'top') idx = i;
  });
  if (idx < 0 || ex.sets.length <= 1) return ex;
  return { ...ex, sets: ex.sets.filter((_, i) => i !== idx) };
}

/** Record a dropped exercise, replacing earlier "−1 set" notes for it. */
function dropCut(cuts: string[], name: string): void {
  for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i] === `−1 set ${name}`) cuts.splice(i, 1);
  cuts.push(`Dropped ${name}`);
}

/**
 * Trim a session until it fits. Order of sacrifice:
 *   1. accessory sets (down to 2)   2. shorten a non-key WOD to its minimum
 *   3. drop lowest-priority accessories   4. weak-point/secondary sets (down to 2)
 *   5. drop a non-key WOD   6. drop priority-2 work   7. primary back-off sets (keep top + 1)
 * Returns the trimmed session and a human-readable list of cuts.
 */
export function fitToBudget(p: SessionPrescription, opts: FitOptions): { session: SessionPrescription; cuts: string[] } {
  let s: SessionPrescription = { ...p, exercises: [...p.exercises] };
  const cuts: string[] = [];
  const est = () => estimateMinutes(s);
  const byLowPriority = () =>
    s.exercises
      .map((e, i) => ({ e, i }))
      .sort((a, b) => b.e.priority - a.e.priority || b.i - a.i);

  let wodShrinkable = true;
  const tryShrinkWod = (minutes: number): boolean => {
    if (!s.conditioning || !opts.rebuildConditioning || !wodShrinkable) return false;
    const rebuilt = opts.rebuildConditioning(minutes);
    if (rebuilt.durationMin >= s.conditioning.durationMin) {
      wodShrinkable = false;
      return false;
    }
    s.conditioning = rebuilt;
    for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i].startsWith('WOD shortened')) cuts.splice(i, 1);
    cuts.push(`WOD shortened to ${rebuilt.durationMin} min`);
    return true;
  };

  for (let guard = 0; guard < 100 && est() > opts.budgetMin; guard++) {
    // 1. accessory sets
    const acc = byLowPriority().find(({ e }) => e.priority >= 3 && e.sets.length > 2);
    if (acc) {
      s.exercises[acc.i] = dropLastNonTopSet(acc.e);
      cuts.push(`−1 set ${acc.e.movementName}`);
      continue;
    }
    // 2. shorten WOD
    if (
      s.conditioning &&
      opts.conditioningPriority > 1 &&
      opts.conditioningMinMinutes != null &&
      s.conditioning.durationMin > opts.conditioningMinMinutes &&
      tryShrinkWod(opts.conditioningMinMinutes)
    ) {
      continue;
    }
    // 3. drop accessories
    const dropAcc = byLowPriority().find(({ e }) => e.priority >= 3);
    if (dropAcc) {
      s.exercises.splice(dropAcc.i, 1);
      dropCut(cuts, dropAcc.e.movementName);
      continue;
    }
    // 4. secondary / weak-point sets
    const sec = byLowPriority().find(({ e }) => e.priority === 2 && e.sets.length > 2);
    if (sec) {
      s.exercises[sec.i] = dropLastNonTopSet(sec.e);
      cuts.push(`−1 set ${sec.e.movementName}`);
      continue;
    }
    // 5. drop non-key WOD
    if (s.conditioning && opts.conditioningPriority > 1) {
      for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i].startsWith('WOD shortened')) cuts.splice(i, 1);
      cuts.push(`Dropped WOD (${s.conditioning.name})`);
      s.conditioning = undefined;
      continue;
    }
    // 6. drop priority-2 work
    const dropSec = byLowPriority().find(({ e }) => e.priority === 2);
    if (dropSec) {
      s.exercises.splice(dropSec.i, 1);
      dropCut(cuts, dropSec.e.movementName);
      continue;
    }
    // 7. primary back-offs, keep top set + 1
    const prim = s.exercises.findIndex((e) => e.sets.length > 2);
    if (prim >= 0) {
      s.exercises[prim] = dropLastNonTopSet(s.exercises[prim]);
      cuts.push(`−1 set ${s.exercises[prim].movementName}`);
      continue;
    }
    // 8. key WOD shortened as a last resort
    if (s.conditioning && s.conditioning.durationMin > 8 && tryShrinkWod(Math.max(8, s.conditioning.durationMin - (est() - opts.budgetMin)))) {
      continue;
    }
    break;
  }
  s = { ...s, estimatedMin: est() };
  return { session: s, cuts };
}
