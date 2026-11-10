/**
 * Progression models. Each turns (movement, slot dose, history) into concrete sets plus a
 * one-line "why". All three are driven by what was actually logged: load × reps × RIR.
 *
 *  - strength:    top set + back-offs from a rolling e1RM, with a success/miss/grind check
 *                 against the last exposure.
 *  - hypertrophy: double progression inside a rep range against an RIR target.
 *  - olympic:     % of a training max built from clean makes; progression is technique-gated.
 */

import { loadFor, loadFraction } from './e1rm';
import { bestCleanLift, estimateE1rm, exposures, workSets, type Exposure } from './history';
import { platesPerSide, roundLoad, stepLoad, barKgFor, isLoaded } from './loading';
import { anchorChain, getMovement } from './movements/library';
import { rirFor } from './periodisation';
import type { SlotTemplate } from './templates';
import type {
  Focus,
  History,
  LoggedSet,
  Movement,
  Phase,
  PrescribedSet,
  Settings,
  WeakPoint,
} from './types';
import { fmtKg } from './util';

export interface Modifiers {
  loadFactor: number;
  setDelta: number;
  rirDelta: number;
  volumeFactor: number;
}

export const NO_MODS: Modifiers = { loadFactor: 1, setDelta: 0, rirDelta: 0, volumeFactor: 1 };

export interface ProgressionContext {
  movement: Movement;
  slot: SlotTemplate;
  phase: Phase;
  weekInBlock: number;
  focus: Focus;
  history: History;
  settings: Settings;
  spotlight?: WeakPoint;
  mods: Modifiers;
}

export interface ProgressionResult {
  sets: PrescribedSet[];
  why: string;
  calibrating: boolean;
  repRange?: [number, number];
}

// ---------------------------------------------------------------------------- helpers

function finalLoad(ctx: ProgressionContext, raw: number, mode: 'nearest' | 'down' = 'nearest'): number | null {
  const { movement, settings, mods } = ctx;
  if (!isLoaded(movement)) return null;
  const adjusted = raw * mods.loadFactor;
  return roundLoad(adjusted, movement, settings.equipment, mods.loadFactor < 1 ? 'down' : mode);
}

function withPlates(ctx: ProgressionContext, set: PrescribedSet): PrescribedSet {
  if (ctx.movement.loadType !== 'barbell' || set.loadKg == null) return set;
  const eq = ctx.settings.equipment;
  return { ...set, platesPerSide: platesPerSide(set.loadKg, barKgFor(ctx.movement, eq), eq.platesKg) };
}

function topSetOf(e: Exposure): LoggedSet | undefined {
  const ws = workSets(e.exercise).filter((s) => s.loadKg != null);
  return ws.find((s) => s.kind === 'top') ?? ws.reduce<LoggedSet | undefined>((b, s) => (!b || (s.loadKg ?? 0) > (b.loadKg ?? 0) ? s : b), undefined);
}

function modNote(mods: Modifiers): string {
  return mods.loadFactor < 1 ? ` (×${mods.loadFactor.toFixed(2)} re-entry)` : '';
}

// ---------------------------------------------------------------------------- strength

interface StrengthDose {
  topReps: number;
  backoffSets: number;
  backoffReps: number;
  backoffPct: number;
}

export function strengthDose(phase: Phase, week: number, role: SlotTemplate['role']): StrengthDose {
  const primary = role === 'primary';
  switch (phase) {
    case 'calibration':
      return { topReps: 5, backoffSets: 2, backoffReps: 5, backoffPct: 0.9 };
    case 'hypertrophy':
      return primary
        ? { topReps: 6, backoffSets: 2, backoffReps: 8, backoffPct: 0.85 }
        : { topReps: 8, backoffSets: 2, backoffReps: 10, backoffPct: 0.85 };
    case 'accumulation':
      return primary
        ? { topReps: 5, backoffSets: 3, backoffReps: 5, backoffPct: 0.9 }
        : { topReps: 6, backoffSets: 2, backoffReps: 8, backoffPct: 0.85 };
    case 'intensification':
      return primary
        ? { topReps: week >= 3 ? 2 : 3, backoffSets: 3, backoffReps: 3, backoffPct: 0.9 }
        : { topReps: 5, backoffSets: 2, backoffReps: 5, backoffPct: 0.9 };
    case 'peak':
      return primary
        ? { topReps: week === 1 ? 2 : 1, backoffSets: week === 3 ? 1 : 2, backoffReps: 2, backoffPct: 0.88 }
        : { topReps: 3, backoffSets: 1, backoffReps: 3, backoffPct: 0.9 };
    case 'taper':
      return { topReps: 2, backoffSets: 1, backoffReps: 2, backoffPct: 0.9 };
    case 'deload':
      return { topReps: 5, backoffSets: 0, backoffReps: 5, backoffPct: 1 };
  }
}

export function prescribeStrength(ctx: ProgressionContext): ProgressionResult {
  const { movement, history, phase, weekInBlock, slot, mods, settings } = ctx;
  const dose = strengthDose(phase, weekInBlock, slot.role);
  const est = estimateE1rm(history, movement.id);

  // ---- deload: straight sets, well short of failure, from the same e1RM
  if (phase === 'deload') {
    if (!est) return calibrationStrength(dose);
    const load = finalLoad(ctx, loadFor(est.e1rm, dose.topReps, 5), 'down');
    const sets = Array.from({ length: 3 }, () => withPlates(ctx, { kind: 'working' as const, loadKg: load, reps: dose.topReps, targetRir: 4 }));
    return { sets, why: `Deload: 3×${dose.topReps} at RIR 4+ (~${Math.round(loadFor(1, dose.topReps, 5) * 100)}% e1RM) from your ${fmtKg(Math.round(est.e1rm))} e1RM.`, calibrating: false };
  }

  if (phase === 'calibration' || !est) return calibrationStrength(dose);

  const targetRir = Math.min(4, rirFor(phase, weekInBlock) + mods.rirDelta);
  const base = loadFor(est.e1rm, dose.topReps, targetRir);
  const last = est.source === 'history' ? exposures(history, movement.id)[0] : undefined;
  const lastTop = last ? topSetOf(last) : undefined;

  let raw = base;
  let why: string;

  if (lastTop && lastTop.loadKg != null) {
    const r0 = lastTop.targetReps ?? lastTop.reps;
    const t0 = lastTop.targetRir ?? targetRir;
    const a = lastTop.reps;
    const k = lastTop.rir ?? t0;
    const prevEq = lastTop.loadKg * (loadFraction(dose.topReps, targetRir) / loadFraction(r0, t0));
    const sameScheme = r0 === dose.topReps && t0 === targetRir;
    const inc = Math.max(0, stepLoad(prevEq, movement, settings.equipment, 1) - prevEq);
    const lastStr = `${fmtKg(lastTop.loadKg)}×${a} @ RIR ${k}`;

    if (a >= r0 && k === t0 - 1) {
      // RIR ratings are only accurate to about ±1: treat as on target, move at most one step.
      raw = Math.min(Math.max(base, prevEq - inc), prevEq + inc);
      why = `${lastStr}: about on target → ${raw > prevEq ? `+${fmtKg(inc)}` : raw < prevEq ? 'small trim' : 'hold'}.`;
    } else if (a >= r0 && k >= t0) {
      raw = Math.min(Math.max(base, prevEq + inc), prevEq * 1.1);
      why =
        base > prevEq + inc
          ? `Last top set ${lastStr} was easier than planned → bigger jump.`
          : sameScheme
            ? `Hit ${lastStr} → +${fmtKg(inc)}.`
            : `Hit ${lastStr}; new target ${dose.topReps} @ RIR ${targetRir}.`;
    } else if (a < r0) {
      raw = a <= r0 - 2 ? Math.min(base, prevEq * 0.95) : Math.min(base, prevEq);
      why =
        a <= r0 - 2
          ? `Missed reps last time (${a}/${r0}) → reduce ~5%.`
          : `Missed a rep last time (${a}/${r0}) → hold.`;
    } else {
      raw = Math.min(base, prevEq);
      why = `Last top set was harder than planned (RIR ${k} vs ${t0}) → hold.`;
    }
  } else if (est.source === 'anchor') {
    why = `Estimated from ${getMovement(est.anchorId!).name} e1RM × ${est.ratio!.toFixed(2)} → conservative start.`;
  } else {
    why = `${dose.topReps} @ RIR ${targetRir} from rolling e1RM ${fmtKg(Math.round(est.e1rm))}.`;
  }

  let top = finalLoad(ctx, raw);
  // A success at the same scheme must actually move the bar.
  if (
    top != null &&
    lastTop?.loadKg != null &&
    mods.loadFactor === 1 &&
    lastTop.reps >= (lastTop.targetReps ?? 0) &&
    (lastTop.rir ?? targetRir) >= (lastTop.targetRir ?? targetRir) &&
    lastTop.targetReps === dose.topReps &&
    (lastTop.targetRir ?? targetRir) === targetRir &&
    top <= lastTop.loadKg
  ) {
    top = stepLoad(lastTop.loadKg, movement, settings.equipment, 1);
  }

  const backoffLoad = top == null ? null : roundLoad(top * dose.backoffPct, movement, settings.equipment, 'nearest');
  const backoffSets = Math.max(1, dose.backoffSets + Math.min(0, mods.setDelta));
  const sets: PrescribedSet[] = [
    withPlates(ctx, { kind: 'top', loadKg: top, reps: dose.topReps, targetRir }),
    ...Array.from({ length: backoffSets }, () =>
      withPlates(ctx, { kind: 'backoff' as const, loadKg: backoffLoad, reps: dose.backoffReps, targetRir: Math.min(4, targetRir + 1) }),
    ),
  ];
  return { sets, why: why + modNote(mods), calibrating: false };
}

function calibrationStrength(dose: StrengthDose): ProgressionResult {
  const reps = dose.topReps;
  return {
    calibrating: true,
    why: `Calibration: work up to a top set of ${reps} you could do 2 more reps with. This sets your e1RM.`,
    sets: [
      { kind: 'calibration', loadKg: null, reps, targetRir: 2, note: `Build in jumps to ${reps} @ RIR 2` },
      ...Array.from({ length: 2 }, () => ({
        kind: 'backoff' as const,
        loadKg: null,
        reps,
        targetRir: 3,
        note: '≈90% of today’s top set',
      })),
    ],
  };
}

// ---------------------------------------------------------------------------- hypertrophy

export function defaultRepRange(movement: Movement, slot: SlotTemplate): [number, number] {
  if (slot.repRange) return slot.repRange;
  const iso = movement.tags.includes('isolation');
  if (movement.pattern === 'core') return [10, 20];
  if (iso && ['lateral-delt', 'rear-delt', 'calf'].includes(movement.pattern)) return [12, 20];
  if (iso) return [10, 15];
  if (movement.loadType === 'bodyweight') return [6, 12];
  return slot.role === 'primary' ? [6, 10] : [8, 12];
}

export function hypertrophySets(ctx: ProgressionContext): number {
  const { slot, focus, phase, weekInBlock, spotlight, mods } = ctx;
  if (phase === 'calibration') return slot.role === 'primary' ? 3 : 2;
  let sets: number;
  if (focus === 'off-season') {
    sets = slot.role === 'primary' ? 4 : slot.priority >= 4 ? 2 : 3;
  } else {
    sets = slot.role === 'primary' || slot.role === 'secondary' ? 3 : slot.role === 'weak-point' ? 3 : 2;
  }
  // Weak-point volume: spotlight adds a set all block; otherwise volume ramps from week 3.
  // Capped at 4 sets per exercise: extra volume beyond that goes into extra slots instead.
  const spot = slot.weakPoint && spotlight === slot.weakPoint && !slot.spotlightOnly;
  if (spot) sets += 1;
  else if (slot.weakPoint && focus === 'off-season' && phase === 'hypertrophy' && weekInBlock >= 3) sets += 1;
  sets = Math.min(4, sets);
  if (phase === 'deload') return Math.max(1, Math.ceil(sets / 2));
  if (slot.role !== 'primary') {
    sets = Math.round(sets * mods.volumeFactor) + mods.setDelta;
  }
  return Math.max(slot.role === 'primary' ? 2 : 1, sets);
}

export function prescribeHypertrophy(ctx: ProgressionContext): ProgressionResult {
  const { movement, history, phase, weekInBlock, mods, settings } = ctx;
  const range = defaultRepRange(movement, ctx.slot);
  const [lo, hi] = range;
  const iso = movement.tags.includes('isolation');
  const targetRir = Math.min(4, (phase === 'deload' ? 4 : rirFor(phase, weekInBlock, iso)) + (phase === 'deload' ? 0 : mods.rirDelta));
  const nSets = hypertrophySets(ctx);
  const loaded = isLoaded(movement);
  const make = (loadKg: number | null, reps: number[], note?: string): PrescribedSet[] =>
    Array.from({ length: nSets }, (_, i) =>
      withPlates(ctx, {
        kind: phase === 'calibration' && loadKg == null && loaded ? 'calibration' : 'working',
        loadKg,
        reps: reps[Math.min(i, reps.length - 1)],
        repRange: range,
        targetRir,
        note,
      }),
    );

  const last = exposures(history, movement.id)[0];

  if (!last) {
    const est = loaded ? estimateE1rm(history, movement.id) : undefined;
    if (loaded && est && phase !== 'calibration') {
      const load = finalLoad(ctx, loadFor(est.e1rm, lo + 2, targetRir), 'down');
      const via = est.source === 'anchor' ? `${getMovement(est.anchorId!).name} × ${est.ratio!.toFixed(2)}` : 'your e1RM';
      return { sets: make(load, [lo + 2]), why: `First time: estimated from ${via}; aim for ${lo}–${hi} @ RIR ${targetRir}.`, calibrating: false, repRange: range };
    }
    const note = loaded ? `Find a load for ${lo}–${hi} @ RIR ${targetRir}` : undefined;
    return {
      sets: make(null, [hi], note),
      why: loaded
        ? `${phase === 'calibration' ? 'Calibration' : 'New movement'}: pick a load you can do for ${lo}–${hi} reps leaving ${targetRir} in the tank.`
        : `Bodyweight: ${lo}–${hi} reps leaving ${targetRir} in reserve.`,
      calibrating: loaded,
      repRange: range,
    };
  }

  const ws = workSets(last.exercise);
  const t0 = ws[0]?.targetRir ?? targetRir;
  const loads = ws.map((s) => s.loadKg).filter((x): x is number => x != null);
  const lastLoad = loads.length ? Math.max(...loads) : null;
  const atLoad = lastLoad == null ? ws : ws.filter((s) => s.loadKg === lastLoad);
  const prevRange = last.exercise.repRange ?? range;
  const topHi = prevRange[1];
  const allTop = atLoad.length > 0 && atLoad.every((s) => s.reps >= topHi && (s.rir ?? t0) >= t0);
  const easy = allTop && atLoad.every((s) => (s.rir ?? t0) >= t0 + 2);
  const belowFloor = (atLoad[0]?.reps ?? lo) < prevRange[0];
  const muchHarder = atLoad.some((s) => s.rir != null && s.rir < t0 - 1);

  // ---------------- bodyweight (unloaded): progress reps, then the variation
  if (!loaded || lastLoad == null) {
    if (movement.loadType === 'weighted-bodyweight' && allTop) {
      const add = settings.equipment.beltStepKg;
      return { sets: make(add, [lo]), why: `Topped ${topHi} reps on bodyweight → add ${fmtKg(add)}.`, calibrating: false, repRange: range };
    }
    if (phase === 'deload') {
      return { sets: make(null, [lo]), why: `Deload: half the sets, ${lo} easy reps.`, calibrating: false, repRange: range };
    }
    const targets = ws.map((s) => Math.min(hi, s.reps + (muchHarder ? 0 : 1)));
    return {
      sets: make(null, targets.length ? targets : [hi]),
      why: allTop
        ? `Top of the range on every set → slow the eccentric to 4 s to keep progressing.`
        : `Beat last time: ${targets.join('/')} reps.`,
      calibrating: false,
      repRange: range,
    };
  }

  // ---------------- loaded double progression
  const eq = settings.equipment;
  let raw = lastLoad;
  let targets: number[];
  let why: string;
  const lastStr = `${fmtKg(lastLoad)} × ${atLoad.map((s) => s.reps).join('/')}`;

  if (easy) {
    const one = stepLoad(lastLoad, movement, eq, 1);
    raw = Math.max(stepLoad(one, movement, eq, 1), lastLoad * 1.05);
    targets = [lo];
    why = `${lastStr} with RIR ${t0 + 2}+ to spare → double jump.`;
  } else if (allTop) {
    raw = stepLoad(lastLoad, movement, eq, 1);
    targets = [lo];
    why = `Topped the range (${lastStr}) → +${fmtKg(raw - lastLoad)}, back to ${lo}+ reps.`;
  } else if (belowFloor) {
    raw = Math.min(stepLoad(lastLoad, movement, eq, -1), lastLoad * 0.95);
    targets = [lo + 1];
    why = `Fell below ${prevRange[0]} reps last time (${lastStr}) → drop the load.`;
  } else {
    raw = lastLoad;
    targets = atLoad.map((s) => Math.min(hi, Math.max(lo, s.reps + (muchHarder ? 0 : 1))));
    why = muchHarder
      ? `Last session ran harder than planned → repeat ${lastStr}.`
      : `Same load, beat last time: ${targets.join('/')} reps.`;
  }

  // Rounding happens on the raw value; never let rounding turn an increase into a hold.
  let load = roundLoad(raw * mods.loadFactor, movement, eq, mods.loadFactor < 1 ? 'down' : 'nearest');
  if (load != null && mods.loadFactor === 1 && (easy || allTop) && load <= lastLoad) load = stepLoad(lastLoad, movement, eq, 1);
  if (load != null && mods.loadFactor === 1 && belowFloor && load >= lastLoad) load = stepLoad(lastLoad, movement, eq, -1);

  if (phase === 'deload') {
    return {
      sets: make(roundLoad(lastLoad, movement, eq, 'nearest'), [lo]),
      why: `Deload: same load, half the sets, ${lo} reps with ~4 in reserve.`,
      calibrating: false,
      repRange: range,
    };
  }
  return { sets: make(load, targets), why: why + modNote(mods), calibrating: false, repRange: range };
}

// ---------------------------------------------------------------------------- olympic

/** Oly sessions as sets × reps @ % of training max, by phase week. */
const OLY_WAVES: Partial<Record<Phase, [number, number, number][]>> = {
  hypertrophy: [[4, 3, 0.7]],
  accumulation: [[5, 3, 0.7], [5, 3, 0.74], [5, 3, 0.77], [4, 3, 0.8]],
  intensification: [[5, 2, 0.8], [5, 2, 0.83], [5, 2, 0.86], [4, 2, 0.88]],
  peak: [[4, 2, 0.85], [5, 1, 0.88], [3, 1, 0.92]],
  taper: [[3, 1, 0.82]],
  deload: [[3, 2, 0.65]],
};

/** Rep-to-1RM factor for Olympic lifts (much flatter than Epley; speed dominates). */
const OLY_REP_FACTOR = [1, 1, 1.04, 1.07, 1.09, 1.11];

/**
 * Training max (TM), replayed deterministically from history (oldest first):
 *   - starts from the first exposure's best clean make (doubles/triples converted conservatively);
 *   - never sits below a clean make's converted value;
 *   - +1% after every clean session at ≥ 74% of TM (+2% if every set was rated RIR ≥ 3),
 *     so sub-maximal waves still move it, but only when technique held;
 *   - −3% after two sessions in a row with misses or flagged technique.
 */
export const OLY_TM_THRESHOLD = 0.74;

export function olympicTrainingMax(history: History, movementId: string): { tm: number; via?: string } | undefined {
  const xs = exposures(history, movementId).slice(0, 60).reverse();
  let tm = 0;
  let missStreak = 0;
  for (const e of xs) {
    const ws = workSets(e.exercise).filter((s) => s.loadKg != null);
    if (!ws.length) continue;
    const bad = ws.filter((s) => s.techniquePoor || (s.targetReps != null && s.reps < s.targetReps));
    let best = 0;
    for (const s of ws) {
      if (bad.includes(s)) continue;
      best = Math.max(best, s.loadKg! * OLY_REP_FACTOR[Math.min(5, Math.max(1, s.reps))]);
    }
    if (tm === 0) {
      tm = best;
      continue;
    }
    tm = Math.max(tm, best);
    const heaviest = Math.max(...ws.map((s) => s.loadKg!));
    if (!bad.length && heaviest >= tm * OLY_TM_THRESHOLD) {
      tm *= ws.every((s) => (s.rir ?? 0) >= 3) ? 1.02 : 1.01;
      missStreak = 0;
    } else if (bad.length) {
      missStreak++;
      if (missStreak >= 2) {
        tm *= 0.97;
        missStreak = 0;
      }
    }
  }
  if (tm) return { tm };
  for (const link of anchorChain(movementId)) {
    const anchorMv = getMovement(link.movementId);
    if (anchorMv.tags.includes('olympic')) {
      const b = bestCleanLift(history, link.movementId);
      if (b) return { tm: b * link.ratio, via: `${anchorMv.name} × ${link.ratio.toFixed(2)}` };
    } else {
      const est = estimateE1rm(history, link.movementId);
      if (est) return { tm: est.e1rm * link.ratio, via: `${anchorMv.name} e1RM × ${link.ratio.toFixed(2)}` };
    }
  }
  return undefined;
}

export function prescribeOlympic(ctx: ProgressionContext): ProgressionResult {
  const { movement, history, phase, weekInBlock, slot, mods, settings } = ctx;
  const tm = olympicTrainingMax(history, movement.id);

  if (phase === 'calibration' || !tm) {
    return {
      calibrating: true,
      why: 'Calibration: build to a crisp heavy single; stop at the first technical breakdown.',
      sets: [
        { kind: 'calibration', loadKg: null, reps: 1, targetRir: 1, note: 'Singles, add 3–5 kg per jump' },
        { kind: 'backoff', loadKg: null, reps: 2, targetRir: 2, note: '2×2 at ~85% of today’s best' },
        { kind: 'backoff', loadKg: null, reps: 2, targetRir: 2 },
      ],
    };
  }

  const wave = OLY_WAVES[phase] ?? OLY_WAVES.accumulation!;
  let [sets, reps, p] = wave[Math.min(wave.length - 1, weekInBlock - 1)];
  if (slot.role === 'secondary') sets = Math.max(2, sets - 1);
  if (slot.role === 'accessory') {
    sets = 3;
    reps = Math.max(2, reps);
    p = Math.min(p, 0.8);
  }
  sets = Math.max(2, sets + Math.min(0, mods.setDelta));

  const planned = tm.tm * p;
  let raw = planned;
  let why = `${sets}×${reps} @ ${Math.round(p * 100)}% of ${fmtKg(Math.round(tm.tm))} TM${tm.via ? ` (from ${tm.via})` : ''}.`;

  const recent = exposures(history, movement.id).slice(0, 2);
  const missesIn = (e: Exposure) =>
    workSets(e.exercise).filter((s) => (s.targetReps != null && s.reps < s.targetReps) || s.techniquePoor).length;
  if (recent.length && phase !== 'deload') {
    const lastLoads = workSets(recent[0].exercise).map((s) => s.loadKg ?? 0);
    const lastLoad = Math.max(0, ...lastLoads);
    const m0 = missesIn(recent[0]);
    if (m0 > 0) {
      const m1 = recent[1] ? missesIn(recent[1]) : 0;
      if (m1 > 0) {
        raw = Math.min(planned, lastLoad * 0.95); // TM also drops 3% (see olympicTrainingMax)
        why = `Misses or soft reps two sessions running → reset 5% and rebuild positions.`;
      } else {
        raw = Math.min(planned, lastLoad);
        why = `${m0} missed/soft rep${m0 > 1 ? 's' : ''} last time → hold at ${fmtKg(lastLoad)} until it's crisp.`;
      }
    } else {
      why = `Last session clean → on plan: ${why}`;
    }
  }

  const load = roundLoad(raw * mods.loadFactor, movement, settings.equipment, 'down');
  return {
    sets: Array.from({ length: sets }, () => withPlates(ctx, { kind: 'working' as const, loadKg: load, reps, targetRir: 2 })),
    why: why + modNote(mods),
    calibrating: false,
  };
}

export function prescribe(ctx: ProgressionContext): ProgressionResult {
  switch (ctx.slot.scheme) {
    case 'strength':
      return prescribeStrength(ctx);
    case 'olympic':
      return prescribeOlympic(ctx);
    default:
      return prescribeHypertrophy(ctx);
  }
}
