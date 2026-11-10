/**
 * Conditioning: benchmarks, erg tests, generated WODs and erg intervals.
 *
 * - Benchmarks are filtered through the restricted movement library, so any classic WOD that
 *   contains a banned (or unavailable, e.g. running) movement disappears automatically.
 * - Generated WODs come from templates with a seeded RNG (deterministic per session).
 * - Erg intervals carry pace/output targets derived from test baselines and nudged by the
 *   last session of the same interval type.
 * - Barbell WOD loads are capped against the user's own strength so "Rx" never means grinding.
 */

import { estimateE1rm, sortedSessions } from './history';
import { roundLoad } from './loading';
import { getMovement, hasMovement } from './movements/library';
import { olympicTrainingMax } from './progression';
import type { ConditioningSpec } from './templates';
import type { History, LoggedConditioning, Settings, WodComponent, WodFormat, WodPrescription } from './types';
import { hashString, pick, rng } from './util';

// ----------------------------------------------------------------------------- benchmarks

export interface BenchmarkDef {
  id: string;
  name: string;
  kind: 'girl' | 'hero' | 'erg-test' | 'other';
  format: WodFormat;
  scoreType: WodPrescription['scoreType'];
  structure: string;
  durationMin: number;
  components: WodComponent[];
}

const RAW_BENCHMARKS: BenchmarkDef[] = [
  { id: 'bm:fran', name: 'Fran', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '21-15-9', durationMin: 10, components: [{ movementId: 'thruster', loadKg: 43 }, { movementId: 'kipping-pull-up' }] },
  { id: 'bm:grace', name: 'Grace', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '30 reps', durationMin: 10, components: [{ movementId: 'clean-and-jerk', reps: 30, loadKg: 61 }] },
  { id: 'bm:isabel', name: 'Isabel', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '30 reps', durationMin: 10, components: [{ movementId: 'snatch', reps: 30, loadKg: 61 }] },
  { id: 'bm:elizabeth', name: 'Elizabeth', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '21-15-9', durationMin: 12, components: [{ movementId: 'clean', loadKg: 61 }, { movementId: 'ring-dip' }] },
  { id: 'bm:karen', name: 'Karen', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '150 reps', durationMin: 14, components: [{ movementId: 'wall-ball', reps: 150, note: '9 kg to 3 m' }] },
  { id: 'bm:annie', name: 'Annie', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '50-40-30-20-10', durationMin: 14, components: [{ movementId: 'double-under' }, { movementId: 'sit-up' }] },
  { id: 'bm:cindy', name: 'Cindy', kind: 'girl', format: 'amrap', scoreType: 'rounds-reps', structure: '20 min AMRAP', durationMin: 20, components: [{ movementId: 'kipping-pull-up', reps: 5 }, { movementId: 'push-up', reps: 10 }, { movementId: 'air-squat', reps: 15 }] },
  { id: 'bm:jackie', name: 'Jackie', kind: 'girl', format: 'for-time', scoreType: 'time', structure: 'For time', durationMin: 15, components: [{ movementId: 'row', metres: 1000 }, { movementId: 'thruster', reps: 50, loadKg: 20 }, { movementId: 'kipping-pull-up', reps: 30 }] },
  { id: 'bm:dt', name: 'DT', kind: 'hero', format: 'for-time', scoreType: 'time', structure: '5 rounds', durationMin: 15, components: [{ movementId: 'deadlift', reps: 12, loadKg: 70 }, { movementId: 'hang-power-clean', reps: 9, loadKg: 70 }, { movementId: 'push-jerk', reps: 6, loadKg: 70 }] },
  { id: 'bm:randy', name: 'Randy', kind: 'hero', format: 'for-time', scoreType: 'time', structure: '75 reps', durationMin: 10, components: [{ movementId: 'power-snatch', reps: 75, loadKg: 34 }] },
  { id: 'bm:amanda', name: 'Amanda', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '9-7-5', durationMin: 15, components: [{ movementId: 'ring-muscle-up' }, { movementId: 'snatch', loadKg: 61 }] },
  // These classics contain banned or unavailable movements and must be filtered out:
  { id: 'bm:diane', name: 'Diane', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '21-15-9', durationMin: 12, components: [{ movementId: 'deadlift', loadKg: 102 }, { movementId: 'handstand-push-up' }] },
  { id: 'bm:mary', name: 'Mary', kind: 'girl', format: 'amrap', scoreType: 'rounds-reps', structure: '20 min AMRAP', durationMin: 20, components: [{ movementId: 'handstand-push-up', reps: 5 }, { movementId: 'pistol', reps: 10 }, { movementId: 'kipping-pull-up', reps: 15 }] },
  { id: 'bm:fgb', name: 'Fight Gone Bad', kind: 'other', format: 'intervals', scoreType: 'reps', structure: '3 rounds', durationMin: 17, components: [{ movementId: 'wall-ball' }, { movementId: 'sumo-deadlift-high-pull' }, { movementId: 'box-jump' }, { movementId: 'push-press' }, { movementId: 'row' }] },
  { id: 'bm:helen', name: 'Helen', kind: 'girl', format: 'for-time', scoreType: 'time', structure: '3 rounds', durationMin: 14, components: [{ movementId: 'run', metres: 400 }, { movementId: 'kb-swing', reps: 21, loadKg: 24 }, { movementId: 'kipping-pull-up', reps: 12 }] },
  // Erg tests
  { id: 'test:row-2k', name: '2 km Row Test', kind: 'erg-test', format: 'test', scoreType: 'time', structure: '2000 m', durationMin: 8, components: [{ movementId: 'row', metres: 2000 }] },
  { id: 'test:ski-1k', name: '1 km Ski Test', kind: 'erg-test', format: 'test', scoreType: 'time', structure: '1000 m', durationMin: 5, components: [{ movementId: 'ski', metres: 1000 }] },
  { id: 'test:air-bike-10', name: '10 min Air Bike Test', kind: 'erg-test', format: 'test', scoreType: 'calories', structure: '10 min max calories', durationMin: 10, components: [{ movementId: 'air-bike' }] },
  { id: 'test:row-500', name: '500 m Row Sprint', kind: 'erg-test', format: 'test', scoreType: 'time', structure: '500 m', durationMin: 3, components: [{ movementId: 'row', metres: 500 }] },
];

export const ALL_BENCHMARK_DEFS = RAW_BENCHMARKS;
export const BENCHMARKS: readonly BenchmarkDef[] = RAW_BENCHMARKS.filter((b) =>
  b.components.every((c) => hasMovement(c.movementId)),
);

// ----------------------------------------------------------------------------- WOD loads

const RX_LOADS: Record<string, number> = {
  thruster: 43,
  'power-clean': 61,
  'hang-power-clean': 61,
  clean: 61,
  'clean-and-jerk': 61,
  'power-snatch': 43,
  'hang-power-snatch': 43,
  snatch: 43,
  deadlift: 100,
  'overhead-squat': 43,
  'push-jerk': 61,
  'front-squat': 61,
  'db-snatch': 22.5,
  'db-thruster': 22.5,
  'db-hang-clean-and-jerk': 22.5,
  'devil-press': 22.5,
  'db-walking-lunge': 22.5,
  'db-box-step-over': 22.5,
  'kb-swing': 24,
  'kb-snatch': 24,
};

/** WOD barbell loads are capped at ~60% of the user's estimated max for the lift. */
const WOD_MAX_FRACTION = 0.6;

function wodLoad(movementId: string, rx: number, history: History, settings: Settings): { loadKg?: number; note?: string } {
  const m = getMovement(movementId);
  let cap = Infinity;
  const oly = m.tags.includes('olympic') ? olympicTrainingMax(history, movementId)?.tm : undefined;
  const est = oly ?? estimateE1rm(history, movementId)?.e1rm;
  if (est && (m.loadType === 'barbell')) cap = est * WOD_MAX_FRACTION;
  const target = Math.min(rx, cap);
  const load = roundLoad(target, m, settings.equipment, 'down') ?? undefined;
  if (load != null && load < rx - 0.01) return { loadKg: load, note: `Rx ${rx} kg — scaled to your numbers` };
  return { loadKg: load ?? rx };
}

function resolveComponent(c: WodComponent, history: History, settings: Settings): WodComponent {
  if (c.loadKg == null) return c;
  const { loadKg, note } = wodLoad(c.movementId, c.loadKg, history, settings);
  return { ...c, loadKg, note: c.note ?? note };
}

// ----------------------------------------------------------------------------- generator pools

type Domain = 'G' | 'W' | 'M';

interface PoolEntry {
  id: string;
  domain: Domain;
  /** [low, high] reps per round; for ergs, calories. */
  reps: [number, number];
  unit?: 'cal' | 'reps';
  skill?: boolean;
}

const POOL: PoolEntry[] = ([
  { id: 'kipping-pull-up', domain: 'G', reps: [8, 15] },
  { id: 'chest-to-bar', domain: 'G', reps: [6, 12], skill: true },
  { id: 'toes-to-bar', domain: 'G', reps: [8, 15], skill: true },
  { id: 'bar-muscle-up', domain: 'G', reps: [3, 7], skill: true },
  { id: 'ring-muscle-up', domain: 'G', reps: [2, 5], skill: true },
  { id: 'ring-dip', domain: 'G', reps: [8, 15] },
  { id: 'push-up', domain: 'G', reps: [10, 20] },
  { id: 'pistol', domain: 'G', reps: [6, 12], skill: true },
  { id: 'ghd-sit-up', domain: 'G', reps: [10, 15] },
  { id: 'rope-climb', domain: 'G', reps: [1, 3], skill: true },
  { id: 'thruster', domain: 'W', reps: [6, 15] },
  { id: 'power-clean', domain: 'W', reps: [5, 10] },
  { id: 'hang-power-clean', domain: 'W', reps: [6, 10] },
  { id: 'power-snatch', domain: 'W', reps: [5, 10] },
  { id: 'hang-power-snatch', domain: 'W', reps: [6, 10] },
  { id: 'deadlift', domain: 'W', reps: [6, 12] },
  { id: 'overhead-squat', domain: 'W', reps: [6, 10] },
  { id: 'push-jerk', domain: 'W', reps: [5, 10] },
  { id: 'front-squat', domain: 'W', reps: [6, 10] },
  { id: 'db-snatch', domain: 'W', reps: [10, 16] },
  { id: 'db-thruster', domain: 'W', reps: [8, 14] },
  { id: 'db-hang-clean-and-jerk', domain: 'W', reps: [8, 12] },
  { id: 'devil-press', domain: 'W', reps: [5, 10] },
  { id: 'kb-swing', domain: 'W', reps: [12, 20] },
  { id: 'wall-ball', domain: 'W', reps: [12, 20] },
  { id: 'db-box-step-over', domain: 'W', reps: [8, 14] },
  { id: 'row', domain: 'M', reps: [10, 18], unit: 'cal' },
  { id: 'ski', domain: 'M', reps: [8, 15], unit: 'cal' },
  { id: 'bike-erg', domain: 'M', reps: [12, 20], unit: 'cal' },
  { id: 'air-bike', domain: 'M', reps: [8, 15], unit: 'cal' },
  { id: 'double-under', domain: 'M', reps: [30, 60] },
  { id: 'burpee', domain: 'M', reps: [8, 15] },
  { id: 'burpee-box-jump-over', domain: 'M', reps: [6, 12] },
  { id: 'bar-facing-burpee', domain: 'M', reps: [6, 12] },
  { id: 'box-jump-over', domain: 'M', reps: [8, 15] },
] satisfies PoolEntry[] as PoolEntry[]).filter((p) => hasMovement(p.id));

function poolFor(domain: Domain, avoid: Set<string>): PoolEntry[] {
  return POOL.filter((p) => p.domain === domain && !avoid.has(getMovement(p.id).pattern));
}

function repsIn([lo, hi]: [number, number], r: () => number, step = 1): number {
  const n = lo + Math.floor(r() * (hi - lo + 1));
  return Math.max(1, Math.round(n / step) * step);
}

function component(p: PoolEntry, reps: number, history: History, settings: Settings): WodComponent {
  const base: WodComponent = p.unit === 'cal' ? { movementId: p.id, calories: reps } : { movementId: p.id, reps };
  const rx = RX_LOADS[p.id];
  if (rx != null) return resolveComponent({ ...base, loadKg: rx }, history, settings);
  if (p.id === 'wall-ball') return { ...base, note: '9 kg to 3 m' };
  return base;
}

// ----------------------------------------------------------------------------- erg intervals

export interface IntervalTemplate {
  id: string;
  name: string;
  movementId: string;
  rounds: [number, number];
  workSec: number;
  restSec: number;
  /** What a split means: pace (sec/500m, lower is better) or calories (higher is better). */
  metric: 'pace' | 'cal';
  /** Baseline test and offset from it. */
  baseline: { testId: string; offset: number };
  emphasis: 'threshold' | 'aerobic' | 'vo2';
  describe: string;
}

export const INTERVALS: IntervalTemplate[] = [
  { id: 'int:row-500', name: 'Row 500 m Repeats', movementId: 'row', rounds: [4, 7], workSec: 105, restSec: 105, metric: 'pace', baseline: { testId: 'test:row-2k', offset: -3 }, emphasis: 'vo2', describe: '500 m' },
  { id: 'int:bike-60-60', name: 'Air Bike 60/60', movementId: 'air-bike', rounds: [5, 12], workSec: 60, restSec: 60, metric: 'cal', baseline: { testId: 'test:air-bike-10', offset: 1.25 }, emphasis: 'vo2', describe: '1:00 hard' },
  { id: 'int:ski-250', name: 'Ski 250 m Repeats', movementId: 'ski', rounds: [5, 10], workSec: 50, restSec: 60, metric: 'pace', baseline: { testId: 'test:ski-1k', offset: -3 }, emphasis: 'vo2', describe: '250 m' },
  { id: 'int:row-threshold', name: 'Row Threshold 4×4', movementId: 'row', rounds: [3, 5], workSec: 240, restSec: 120, metric: 'pace', baseline: { testId: 'test:row-2k', offset: 6 }, emphasis: 'threshold', describe: '4:00 at threshold' },
  { id: 'int:row-aerobic', name: 'Row Aerobic Blocks', movementId: 'row', rounds: [3, 4], workSec: 360, restSec: 60, metric: 'pace', baseline: { testId: 'test:row-2k', offset: 18 }, emphasis: 'aerobic', describe: '6:00 conversational' },
  { id: 'int:bike-aerobic', name: 'Bike Erg Aerobic Blocks', movementId: 'bike-erg', rounds: [3, 4], workSec: 420, restSec: 60, metric: 'pace', baseline: { testId: 'test:row-2k', offset: 0 }, emphasis: 'aerobic', describe: '7:00 nasal-breathing pace' },
];

function lastConditioning(history: History, predicate: (c: LoggedConditioning) => boolean): LoggedConditioning | undefined {
  const s = sortedSessions(history);
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i].conditioning;
    if (c && predicate(c)) return c;
  }
  return undefined;
}

/** Baseline split for a test: pace sec/500m for distance tests, cal/min for the bike test. */
export function baselineFromTest(history: History, testId: string): number | undefined {
  const t = lastConditioning(history, (c) => c.wodId === testId);
  if (!t) return undefined;
  const def = RAW_BENCHMARKS.find((b) => b.id === testId);
  const metres = def?.components[0].metres;
  if (metres && t.score.timeSec) return (t.score.timeSec / metres) * 500;
  if (t.score.calories && def) return t.score.calories / def.durationMin;
  return undefined;
}

function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/500m`;
}

export function intervalTarget(history: History, t: IntervalTemplate): { target?: number; why: string } {
  const base = baselineFromTest(history, t.baseline.testId);
  if (base == null) {
    return { why: 'No test baseline yet: hold the hardest pace you can repeat evenly. We’ll set targets from this.' };
  }
  let target = t.metric === 'pace' ? base + t.baseline.offset : Math.round(base * t.baseline.offset);
  let why =
    t.metric === 'pace'
      ? `Target ${fmtPace(target)} = test pace ${t.baseline.offset >= 0 ? '+' : ''}${t.baseline.offset}s.`
      : `Target ${target} cal/round from your 10-min test (${base.toFixed(1)} cal/min).`;
  const last = lastConditioning(history, (c) => c.wodId === t.id && c.targetSplit != null);
  if (last?.score.splits?.length && last.targetSplit != null) {
    const splits = last.score.splits;
    const avg = splits.reduce((a, b) => a + b, 0) / splits.length;
    const prev = last.targetSplit;
    if (t.metric === 'pace') {
      if (splits.every((s) => s <= prev)) {
        target = Math.min(target, prev - 1);
        why = `Held ${fmtPace(prev)} on every rep last time → 1 s faster.`;
      } else if (avg > prev + 2) {
        target = Math.max(target, prev + 1);
        why = `Faded off ${fmtPace(prev)} last time → ease 1 s and hold it evenly.`;
      } else {
        target = prev;
        why = `Close to ${fmtPace(prev)} last time → same target, make every rep.`;
      }
    } else {
      if (splits.every((s) => s >= prev)) {
        target = Math.max(target, prev + 1);
        why = `Hit ${prev} cal on every round → +1 cal.`;
      } else {
        target = prev;
        why = `Missed ${prev} cal on some rounds → same target.`;
      }
    }
  }
  return { target, why };
}

/** Shortest session an interval template can produce (minimum rounds). */
export function minIntervalMinutes(t: IntervalTemplate): number {
  return Math.round((t.rounds[0] * (t.workSec + t.restSec) - t.restSec) / 60);
}

function buildIntervals(t: IntervalTemplate, minutes: number, history: History): WodPrescription {
  const roundSec = t.workSec + t.restSec;
  const rounds = Math.max(t.rounds[0], Math.min(t.rounds[1], Math.floor((minutes * 60 + t.restSec) / roundSec)));
  const { target, why } = intervalTarget(history, t);
  const targetStr =
    target == null ? undefined : t.metric === 'pace' ? `${fmtPace(target)} or faster` : `${target}+ cal per round`;
  return {
    id: t.id,
    name: t.name,
    format: 'intervals',
    scoreType: t.metric === 'pace' ? 'time' : 'calories',
    durationMin: Math.round((rounds * roundSec - t.restSec) / 60),
    intervals: { rounds, workSec: t.workSec, restSec: t.restSec, target: targetStr },
    components: [{ movementId: t.movementId, note: t.describe }],
    structure: `${rounds} × ${t.describe}, rest ${formatSec(t.restSec)}`,
    target: targetStr,
    why,
  };
}

function formatSec(s: number): string {
  return s % 60 === 0 ? `${s / 60}:00` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------- public API

export interface ConditioningContext {
  spec: ConditioningSpec;
  history: History;
  settings: Settings;
  seed: number;
  sessionNumber: number;
  dayId: string;
  /** Movement patterns already loaded heavily today; WODs avoid repeating them. */
  avoidPatterns: string[];
  mode: 'normal' | 'calibration' | 'deload' | 'benchmark' | 'taper';
  /** Calibration index (which test to run). */
  calibrationIndex?: number;
  /** Minutes override (e.g. trimmed for time). */
  minutes?: number;
}

const CALIBRATION_TESTS = ['test:row-2k', 'bm:fran', 'test:air-bike-10', 'test:ski-1k', 'bm:grace', 'bm:cindy'];

export function benchmarkPrescription(def: BenchmarkDef, history: History, settings: Settings, why: string): WodPrescription {
  const components = def.components.map((c) => resolveComponent(c, history, settings));
  const last = lastConditioning(history, (c) => c.wodId === def.id);
  const prev = last ? describeScore(last) : undefined;
  return {
    id: def.id,
    name: def.name,
    format: def.format,
    scoreType: def.scoreType,
    durationMin: def.durationMin,
    components,
    structure: def.structure,
    benchmark: def.name,
    target: prev ? `Beat ${prev}` : undefined,
    why,
  };
}

export function describeScore(c: LoggedConditioning): string {
  const s = c.score;
  if (s.timeSec != null) return formatSec(Math.round(s.timeSec));
  if (s.rounds != null) return `${s.rounds}+${s.reps ?? 0}`;
  if (s.calories != null) return `${s.calories} cal`;
  if (s.reps != null) return `${s.reps} reps`;
  if (s.loadKg != null) return `${s.loadKg} kg`;
  return 'last score';
}

/** Least-recently-performed benchmark matching a filter. */
export function nextBenchmark(history: History, filter: (b: BenchmarkDef) => boolean): BenchmarkDef | undefined {
  const candidates = BENCHMARKS.filter(filter);
  const lastDone = (id: string) => {
    const s = sortedSessions(history);
    for (let i = s.length - 1; i >= 0; i--) if (s[i].conditioning?.wodId === id) return s[i].date;
    return '';
  };
  return [...candidates].sort((a, b) => lastDone(a.id).localeCompare(lastDone(b.id)) || a.id.localeCompare(b.id))[0];
}

export function buildConditioning(ctx: ConditioningContext): WodPrescription {
  const { spec, history, settings, mode } = ctx;
  const r = rng(hashString(`${ctx.seed}:${ctx.sessionNumber}:${ctx.dayId}`));
  const minutes = ctx.minutes ?? Math.round(spec.minutes[0] + r() * (spec.minutes[1] - spec.minutes[0]));
  const avoid = new Set(ctx.avoidPatterns);

  if (mode === 'calibration') {
    const id = CALIBRATION_TESTS[(ctx.calibrationIndex ?? 0) % CALIBRATION_TESTS.length];
    const def = BENCHMARKS.find((b) => b.id === id) ?? BENCHMARKS[0];
    return benchmarkPrescription(def, history, settings, 'Calibration: a baseline test so conditioning targets are set from your own numbers.');
  }

  if (mode === 'deload' || mode === 'taper') {
    const t = INTERVALS.find((i) => i.id === 'int:row-aerobic')!;
    const w = buildIntervals(t, mode === 'deload' ? 15 : 12, history);
    return { ...w, why: mode === 'deload' ? 'Deload: easy aerobic work only, nasal breathing.' : 'Taper: keep the engine ticking without fatigue.' };
  }

  if (mode === 'benchmark') {
    const ergDay = spec.emphasis === 'erg-intervals' || spec.emphasis === 'aerobic';
    const def = nextBenchmark(history, (b) =>
      ergDay ? b.kind === 'erg-test' : b.kind !== 'erg-test' && b.durationMin <= spec.minutes[1] + 6,
    );
    if (def) return benchmarkPrescription(def, history, settings, 'End-of-block retest: measures what this block actually changed.');
  }

  switch (spec.emphasis) {
    case 'erg-intervals': {
      const fitting = INTERVALS.filter((i) => i.emphasis !== 'aerobic' && minIntervalMinutes(i) <= minutes);
      const threshold = fitting.find((i) => i.emphasis === 'threshold');
      const t = minutes >= 14 && threshold ? threshold : pick(fitting.filter((i) => i.emphasis === 'vo2'), r);
      return buildIntervals(t, minutes, history);
    }
    case 'aerobic': {
      const fitting = INTERVALS.filter((i) => i.emphasis === 'aerobic' && minIntervalMinutes(i) <= minutes);
      if (fitting.length && r() < 0.5) return buildIntervals(pick(fitting, r), minutes, history);
      return aerobicEmom(minutes, r);
    }
    case 'gymnastics':
      return gymnasticsPiece(minutes, r, history, settings, avoid);
    case 'barbell-cycling':
      return barbellPiece(minutes, r, history, settings, avoid);
    case 'long-mixed':
      return r() < 0.5 ? chipper(minutes, r, history, settings, avoid) : amrap(minutes, 3, r, history, settings, avoid);
    case 'short-intense':
      return r() < 0.5 ? couplet(minutes, r, history, settings, avoid) : amrap(minutes, 2, r, history, settings, avoid);
    case 'mixed':
    default:
      return r() < 0.6 ? amrap(minutes, 3, r, history, settings, avoid) : mixedEmom(minutes, r, history, settings, avoid);
  }
}

// ----------------------------------------------------------------------------- generators

function choose(domain: Domain, r: () => number, avoid: Set<string>, exclude: string[] = []): PoolEntry {
  const pool = poolFor(domain, avoid).filter((p) => !exclude.includes(p.id));
  return pick(pool.length ? pool : POOL.filter((p) => p.domain === domain), r);
}

function couplet(minutes: number, r: () => number, h: History, s: Settings, avoid: Set<string>): WodPrescription {
  const a = choose('W', r, avoid);
  const b = choose(r() < 0.5 ? 'G' : 'M', r, avoid);
  const scheme = pick(['21-15-9', '15-12-9', '12-9-6'], r);
  return {
    id: `gen:${hashString(`${a.id}${b.id}${scheme}`)}`,
    name: 'Sprint Couplet',
    format: 'for-time',
    scoreType: 'time',
    durationMin: Math.max(6, minutes),
    components: [component(a, 0, h, s), component(b, 0, h, s)].map(({ reps: _r, calories: _c, ...c }) => c),
    structure: `${scheme}, for time${b.unit === 'cal' ? ' (calories on the erg)' : ''}`,
    target: `Unbroken or 2 sets max on ${getMovement(a.id).name}. Cap ${Math.max(6, minutes)} min.`,
    why: 'Short, intense couplet: high power output and pacing under fatigue.',
  };
}

function amrap(minutes: number, n: 2 | 3, r: () => number, h: History, s: Settings, avoid: Set<string>): WodPrescription {
  const domains: Domain[] = n === 2 ? ['W', r() < 0.5 ? 'G' : 'M'] : ['M', 'W', 'G'];
  const picked: PoolEntry[] = [];
  for (const d of domains) picked.push(choose(d, r, avoid, picked.map((p) => p.id)));
  const comps = picked.map((p) => component(p, repsIn(p.reps, r, p.reps[1] >= 20 ? 5 : 1), h, s));
  return {
    id: `gen:${hashString(comps.map((c) => c.movementId).join('|') + minutes)}`,
    name: `${minutes}-Minute AMRAP`,
    format: 'amrap',
    scoreType: 'rounds-reps',
    durationMin: minutes,
    components: comps,
    structure: `AMRAP ${minutes} min`,
    target: 'Steady rounds: the last round should be as fast as the first.',
    why: n === 2 ? 'Short AMRAP: sustained high output.' : 'Mixed-modal AMRAP: engine plus movement quality under fatigue.',
  };
}

function chipper(minutes: number, r: () => number, h: History, s: Settings, avoid: Set<string>): WodPrescription {
  const order: Domain[] = ['M', 'W', 'G', 'W', 'M'];
  const picked: PoolEntry[] = [];
  for (const d of order) picked.push(choose(d, r, avoid, picked.map((p) => p.id)));
  const comps = picked.map((p) => component(p, p.reps[1] * 2, h, s));
  return {
    id: `gen:${hashString(comps.map((c) => c.movementId).join('|') + 'chip')}`,
    name: 'Chipper',
    format: 'chipper',
    scoreType: 'time',
    durationMin: minutes,
    components: comps,
    structure: `For time, cap ${minutes} min`,
    target: 'Break sets early, keep moving.',
    why: 'Longer chipper: muscular endurance and pacing across many movements.',
  };
}

function mixedEmom(minutes: number, r: () => number, h: History, s: Settings, avoid: Set<string>): WodPrescription {
  const total = Math.round(minutes / 3) * 3 || 12;
  const picked: PoolEntry[] = [];
  for (const d of ['M', 'W', 'G'] as Domain[]) picked.push(choose(d, r, avoid, picked.map((p) => p.id)));
  const comps = picked.map((p) => component(p, Math.max(p.reps[0], Math.round((p.reps[0] + p.reps[1]) / 2) - 2), h, s));
  return {
    id: `gen:${hashString(comps.map((c) => c.movementId).join('|') + 'emom')}`,
    name: `EMOM ${total}`,
    format: 'emom',
    scoreType: 'reps',
    durationMin: total,
    components: comps,
    structure: `EMOM ${total} min, rotating stations`,
    target: 'Finish each minute with 15–20 s to spare.',
    why: 'EMOM: repeatable output with built-in rest.',
  };
}

function aerobicEmom(minutes: number, r: () => number): WodPrescription {
  const total = Math.round(minutes / 3) * 3;
  const ergs = ['row', 'air-bike', 'ski', 'bike-erg'].filter(hasMovement);
  const a = pick(ergs, r);
  const b = pick(ergs.filter((x) => x !== a), r);
  return {
    id: 'gen:aerobic-emom',
    name: `Aerobic EMOM ${total}`,
    format: 'emom',
    scoreType: 'calories',
    durationMin: total,
    components: [
      { movementId: a, note: '45 s easy-moderate' },
      { movementId: b, note: '45 s easy-moderate' },
      { movementId: 'burpee', reps: 6, note: 'or rest' },
    ],
    structure: `EMOM ${total}, rotate`,
    target: 'Conversational pace. Zone 2–3 on the H10.',
    why: 'Aerobic base: high volume at low intensity, low recovery cost.',
  };
}

function gymnasticsPiece(minutes: number, r: () => number, h: History, s: Settings, avoid: Set<string>): WodPrescription {
  const total = Math.max(10, Math.round(minutes / 2) * 2);
  const skills = POOL.filter((p) => p.domain === 'G' && p.skill);
  const a = pick(skills, r);
  const b = choose('M', r, avoid);
  const reps = Math.max(1, Math.round(a.reps[0] * 0.8));
  return {
    id: `gen:${hashString(a.id + b.id + 'gym')}`,
    name: `Gymnastics EMOM ${total}`,
    format: 'emom',
    scoreType: 'reps',
    durationMin: total,
    components: [
      { movementId: a.id, reps, note: 'odd minutes, crisp reps' },
      component(b, Math.round((b.reps[0] + b.reps[1]) / 2), h, s),
    ],
    structure: `EMOM ${total}: alternate`,
    target: 'Every rep with full range and good positions. Add 1 rep/min next time if easy.',
    why: 'Gymnastics capacity: quality volume on high-skill movements before fatigue degrades them.',
  };
}

function barbellPiece(minutes: number, r: () => number, h: History, s: Settings, avoid: Set<string>): WodPrescription {
  const a = choose('W', r, avoid);
  const b = choose('G', r, avoid);
  const c = choose('M', r, avoid);
  const rounds = minutes >= 13 ? 5 : 4;
  const comps = [component(a, repsIn(a.reps, r), h, s), component(b, repsIn(b.reps, r), h, s), component(c, repsIn(c.reps, r), h, s)];
  return {
    id: `gen:${hashString(comps.map((x) => x.movementId).join('|') + 'bb')}`,
    name: 'Barbell Cycling',
    format: 'for-time',
    scoreType: 'time',
    durationMin: minutes,
    components: comps,
    structure: `${rounds} rounds for time, cap ${minutes} min`,
    target: `Touch-and-go on the barbell if positions hold.`,
    why: 'Barbell cycling: efficient, repeatable technique under fatigue.',
  };
}
