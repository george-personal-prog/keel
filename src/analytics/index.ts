/**
 * Analytics: pure functions over the training history. No opaque scores: every number here
 * is either something the user logged or a simple, documented calculation on it.
 */

import { bestSetE1rm, BENCHMARKS, getMovement, type History, type LoggedConditioning, type Muscle, type SessionLog, type SkipReason } from '../engine';
import { addSets, type MuscleSets } from '../engine/volume';
import { addDays, daysBetween, parseDate } from '../engine/util';

export const WEAK_POINT_MUSCLES: Muscle[] = ['delts-side', 'delts-rear', 'chest-upper', 'lats'];
export const MAIN_LIFTS = ['back-squat', 'front-squat', 'deadlift', 'incline-bench-press', 'bench-press', 'snatch', 'clean-and-jerk', 'clean', 'weighted-pull-up'];

// ------------------------------------------------------------------ dates

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  const dow = (new Date(parseDate(iso)).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(iso, -dow);
}

export function lastWeeks(today: string, n: number): string[] {
  const end = weekStart(today);
  return Array.from({ length: n }, (_, i) => addDays(end, -7 * (n - 1 - i)));
}

function sorted(history: History): SessionLog[] {
  return [...history.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.sessionNumber - b.sessionNumber);
}

// ------------------------------------------------------------------ strength

export interface E1rmPoint {
  date: string;
  sessionId: string;
  e1rm: number;
  load: number;
  reps: number;
  rir: number | null;
  pr: boolean;
}

/** Best-set e1RM per session for one movement (deloads excluded), with PR flags. */
export function e1rmSeries(history: History, movementId: string): E1rmPoint[] {
  const out: E1rmPoint[] = [];
  let best = 0;
  for (const s of sorted(history)) {
    if (s.deload) continue;
    for (const ex of s.exercises) {
      if (ex.movementId !== movementId || ex.scheme === 'olympic') continue;
      const e1 = bestSetE1rm(ex.sets);
      if (!e1) continue;
      const top = ex.sets.filter((x) => x.loadKg != null).reduce((b, x) => (bestSetE1rm([x]) > bestSetE1rm([b]) ? x : b));
      const pr = out.length > 0 && e1 > best * 1.005;
      best = Math.max(best, e1);
      out.push({ date: s.date, sessionId: s.id, e1rm: e1, load: top.loadKg ?? 0, reps: top.reps, rir: top.rir, pr });
    }
  }
  return out;
}

/** Olympic lifts: heaviest clean make per session (no e1RM extrapolation for skill lifts). */
export function bestMakeSeries(history: History, movementId: string): E1rmPoint[] {
  const out: E1rmPoint[] = [];
  let best = 0;
  for (const s of sorted(history)) {
    if (s.deload) continue;
    for (const ex of s.exercises) {
      if (ex.movementId !== movementId) continue;
      const makes = ex.sets.filter((x) => x.loadKg != null && !x.techniquePoor && (x.targetReps == null || x.reps >= x.targetReps));
      if (!makes.length) continue;
      const top = makes.reduce((b, x) => ((x.loadKg ?? 0) > (b.loadKg ?? 0) ? x : b));
      const pr = out.length > 0 && (top.loadKg ?? 0) > best;
      best = Math.max(best, top.loadKg ?? 0);
      out.push({ date: s.date, sessionId: s.id, e1rm: top.loadKg ?? 0, load: top.loadKg ?? 0, reps: top.reps, rir: top.rir, pr });
    }
  }
  return out;
}

export function liftSeries(history: History, movementId: string): { points: E1rmPoint[]; metric: 'e1rm' | 'best-make' } {
  const oly = getMovement(movementId).tags.includes('olympic');
  return oly ? { points: bestMakeSeries(history, movementId), metric: 'best-make' } : { points: e1rmSeries(history, movementId), metric: 'e1rm' };
}

/** Loaded movements with ≥ 2 exposures: main lifts first (in a fixed order), then by frequency. */
export function trackedLifts(history: History): string[] {
  const counts = new Map<string, number>();
  for (const s of history.sessions) {
    for (const ex of s.exercises) {
      if (ex.sets.some((x) => x.loadKg != null && x.loadKg > 0)) counts.set(ex.movementId, (counts.get(ex.movementId) ?? 0) + 1);
    }
  }
  const ids = [...counts.keys()].filter((id) => (counts.get(id) ?? 0) >= 2);
  return ids.sort((a, b) => {
    const ia = MAIN_LIFTS.indexOf(a);
    const ib = MAIN_LIFTS.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
  });
}

/** Simple least-squares slope, kg per week, over the last `days` days. */
export function trendPerWeek(points: { date: string; e1rm: number }[], days = 56): number | undefined {
  if (points.length < 3) return undefined;
  const last = points[points.length - 1].date;
  const pts = points.filter((p) => daysBetween(p.date, last) <= days);
  if (pts.length < 3) return undefined;
  const xs = pts.map((p) => daysBetween(pts[0].date, p.date) / 7);
  const ys = pts.map((p) => p.e1rm);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den ? num / den : undefined;
}

export interface RepPR {
  reps: number;
  loadKg: number;
  date: string;
}

/** Heaviest load lifted for each rep count (1–15), from any working set. */
export function repPRs(history: History, movementId: string): RepPR[] {
  const best = new Map<number, RepPR>();
  for (const s of sorted(history)) {
    for (const ex of s.exercises) {
      if (ex.movementId !== movementId) continue;
      for (const x of ex.sets) {
        if (x.kind === 'warmup' || x.loadKg == null || x.reps < 1 || x.reps > 15) continue;
        const cur = best.get(x.reps);
        if (!cur || x.loadKg > cur.loadKg) best.set(x.reps, { reps: x.reps, loadKg: x.loadKg, date: s.date });
      }
    }
  }
  // A rep PR at N reps also beats any lighter load at fewer reps: keep only the meaningful frontier.
  const all = [...best.values()].sort((a, b) => a.reps - b.reps);
  return all.filter((p) => !all.some((q) => q.reps > p.reps && q.loadKg >= p.loadKg));
}

// ------------------------------------------------------------------ volume

export interface WeekVolume {
  weekStart: string;
  sessions: number;
  hardSets: number;
  tonnage: number;
  muscles: MuscleSets;
  hrLoad: number;
}

function isHard(x: { kind: string; reps: number; rir: number | null }): boolean {
  return x.kind !== 'warmup' && x.reps > 0 && (x.rir == null || x.rir <= 4);
}

export function weeklyVolume(history: History, today: string, weeks = 8, maxHr?: number): WeekVolume[] {
  const starts = lastWeeks(today, weeks);
  const hrMax = maxHr ?? observedMaxHr(history);
  return starts.map((ws) => {
    const end = addDays(ws, 7);
    const ss = history.sessions.filter((s) => s.date >= ws && s.date < end);
    const muscles: MuscleSets = {};
    let hardSets = 0;
    let tonnage = 0;
    let hrLoad = 0;
    for (const s of ss) {
      for (const ex of s.exercises) {
        const hard = ex.sets.filter(isHard);
        hardSets += hard.length;
        tonnage += hard.reduce((a, x) => a + (x.loadKg ?? 0) * x.reps, 0);
        addSets(muscles, ex.movementId, hard.length);
      }
      if (s.conditioning) hrLoad += trainingLoad(s.conditioning, hrMax)?.load ?? 0;
    }
    return { weekStart: ws, sessions: ss.length, hardSets, tonnage, muscles, hrLoad: Math.round(hrLoad) };
  });
}

// ------------------------------------------------------------------ heart-rate load

/**
 * Training load, Edwards' method: minutes in each HR zone × zone number (1–5).
 * With zone times logged, they're used directly. With only an average HR, the whole
 * piece is counted in the zone that average falls in (% of max HR: <60 Z1, 60–70 Z2,
 * 70–80 Z3, 80–90 Z4, ≥90 Z5). Max HR = the highest max HR you've logged (fallback 190).
 */
export function trainingLoad(c: LoggedConditioning, maxHr: number): { load: number; method: 'zones' | 'average' } | undefined {
  if (c.hr?.zonesSec?.some((z) => z > 0)) {
    return { load: c.hr.zonesSec.reduce((a, sec, i) => a + (sec / 60) * (i + 1), 0), method: 'zones' };
  }
  if (c.hr?.avg && c.durationMin) {
    const pctMax = c.hr.avg / maxHr;
    const zone = pctMax < 0.6 ? 1 : pctMax < 0.7 ? 2 : pctMax < 0.8 ? 3 : pctMax < 0.9 ? 4 : 5;
    return { load: c.durationMin * zone, method: 'average' };
  }
  return undefined;
}

export function observedMaxHr(history: History): number {
  const xs = history.sessions.map((s) => s.conditioning?.hr?.max ?? 0).filter((x) => x > 120);
  return xs.length ? Math.max(...xs) : 190;
}

// ------------------------------------------------------------------ adherence

export interface Adherence {
  weeks: { weekStart: string; sessions: number; target: number; skips: number }[];
  /** Consecutive completed weeks (current week excluded) that hit the target. */
  streak: number;
  rate: number;
  skipReasons: Record<SkipReason, number>;
}

export function adherence(history: History, today: string, frequency: number, weeks = 12): Adherence {
  const starts = lastWeeks(today, weeks);
  const first = sorted(history)[0]?.date;
  const rows = starts.map((ws) => {
    const end = addDays(ws, 7);
    return {
      weekStart: ws,
      sessions: history.sessions.filter((s) => s.date >= ws && s.date < end).length,
      target: frequency,
      skips: history.skips.filter((s) => s.date >= ws && s.date < end).length,
    };
  });
  // streak over the full history, not just the window
  let streak = 0;
  if (first) {
    let ws = addDays(weekStart(today), -7);
    while (ws >= weekStart(first)) {
      const end = addDays(ws, 7);
      const n = history.sessions.filter((s) => s.date >= ws && s.date < end).length;
      if (n >= frequency) streak++;
      else break;
      ws = addDays(ws, -7);
    }
  }
  const counted = rows.filter((r) => !first || r.weekStart >= weekStart(first)).slice(0, -1);
  const done = counted.reduce((a, r) => a + Math.min(r.sessions, r.target), 0);
  const target = counted.reduce((a, r) => a + r.target, 0);
  const since = starts[0];
  const skipReasons: Record<SkipReason, number> = { motivation: 0, busy: 0, ill: 0, away: 0 };
  for (const s of history.skips) if (s.date >= since) skipReasons[s.reason]++;
  return { weeks: rows, streak, rate: target ? done / target : 0, skipReasons };
}

// ------------------------------------------------------------------ conditioning

export type Direction = 'lower' | 'higher';

export interface BenchmarkResult {
  date: string;
  value: number;
  rx: boolean;
  label: string;
  pr: boolean;
}

export interface BenchmarkHistory {
  id: string;
  name: string;
  kind: string;
  direction: Direction;
  results: BenchmarkResult[];
  best?: BenchmarkResult;
}

export function scoreValue(c: LoggedConditioning): { value: number; direction: Direction } | undefined {
  const s = c.score;
  if (s.timeSec != null) return { value: s.timeSec, direction: 'lower' };
  if (s.rounds != null) return { value: s.rounds * 1000 + (s.reps ?? 0), direction: 'higher' };
  if (s.calories != null) return { value: s.calories, direction: 'higher' };
  if (s.reps != null) return { value: s.reps, direction: 'higher' };
  if (s.metres != null) return { value: s.metres, direction: 'higher' };
  if (s.loadKg != null) return { value: s.loadKg, direction: 'higher' };
  return undefined;
}

export function scoreLabel(c: LoggedConditioning): string {
  const s = c.score;
  if (s.timeSec != null) return `${Math.floor(s.timeSec / 60)}:${String(Math.round(s.timeSec % 60)).padStart(2, '0')}`;
  if (s.rounds != null) return `${s.rounds}+${s.reps ?? 0}`;
  if (s.calories != null) return `${s.calories} cal`;
  if (s.reps != null) return `${s.reps} reps`;
  if (s.metres != null) return `${s.metres} m`;
  if (s.loadKg != null) return `${s.loadKg} kg`;
  return '—';
}

/** History of every benchmark / test performed. Only Rx results count toward PRs (tests are always Rx). */
export function benchmarkHistories(history: History): BenchmarkHistory[] {
  const map = new Map<string, BenchmarkHistory>();
  for (const s of sorted(history)) {
    const c = s.conditioning;
    if (!c || !(c.wodId.startsWith('bm:') || c.wodId.startsWith('test:'))) continue;
    const v = scoreValue(c);
    if (!v) continue;
    const def = BENCHMARKS.find((b) => b.id === c.wodId);
    const h = map.get(c.wodId) ?? { id: c.wodId, name: c.name, kind: def?.kind ?? 'other', direction: v.direction, results: [] };
    const rx = c.score.rx !== false;
    const better = (a: number, b: number) => (v.direction === 'lower' ? a < b : a > b);
    const pr = rx && !!h.best && better(v.value, h.best.value);
    const r: BenchmarkResult = { date: s.date, value: v.value, rx, label: scoreLabel(c), pr };
    h.results.push(r);
    if (rx && (!h.best || better(v.value, h.best.value))) h.best = r;
    map.set(c.wodId, h);
  }
  return [...map.values()].sort((a, b) => (b.results.at(-1)?.date ?? '').localeCompare(a.results.at(-1)?.date ?? ''));
}

export interface IntervalPoint {
  date: string;
  avg: number;
  target?: number;
}

/** Average split per interval session, by interval type (pace: lower is better; cal: higher). */
export function intervalSeries(history: History): Map<string, { name: string; metric: 'pace' | 'cal'; points: IntervalPoint[] }> {
  const out = new Map<string, { name: string; metric: 'pace' | 'cal'; points: IntervalPoint[] }>();
  for (const s of sorted(history)) {
    const c = s.conditioning;
    if (!c || !c.wodId.startsWith('int:') || !c.score.splits?.length) continue;
    const metric: 'pace' | 'cal' = c.scoreType === 'time' ? 'pace' : 'cal';
    const avg = c.score.splits.reduce((a, b) => a + b, 0) / c.score.splits.length;
    const row = out.get(c.wodId) ?? { name: c.name, metric, points: [] };
    row.points.push({ date: s.date, avg, target: c.targetSplit });
    out.set(c.wodId, row);
  }
  return out;
}

// ------------------------------------------------------------------ blocks

export interface BlockSummary {
  blockNumber: number;
  from: string;
  to: string;
  sessions: number;
  deloadSessions: number;
  weeks: number;
  liftChanges: { movementId: string; name: string; from: number; to: number }[];
  weakPointSetsPerWeek: number;
  benchmarks: { name: string; label: string; pr: boolean }[];
}

export function blockSummaries(history: History): BlockSummary[] {
  const byBlock = new Map<number, SessionLog[]>();
  for (const s of sorted(history)) {
    if (s.blockNumber == null || s.phase === 'calibration') continue;
    byBlock.set(s.blockNumber, [...(byBlock.get(s.blockNumber) ?? []), s]);
  }
  const bms = benchmarkHistories(history);
  return [...byBlock.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([blockNumber, ss]) => {
      const from = ss[0].date;
      const to = ss[ss.length - 1].date;
      const weeks = Math.max(1, Math.round(daysBetween(from, to) / 7) + 1);
      const ids = new Set(ss.flatMap((s) => s.exercises.map((e) => e.movementId)));
      const liftChanges = MAIN_LIFTS.filter((id) => ids.has(id))
        .map((id) => {
          const pts = e1rmSeries({ sessions: ss, skips: [] }, id);
          return pts.length >= 2 ? { movementId: id, name: getMovement(id).name, from: pts[0].e1rm, to: pts[pts.length - 1].e1rm } : undefined;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const m: MuscleSets = {};
      for (const s of ss) for (const ex of s.exercises) addSets(m, ex.movementId, ex.sets.filter(isHard).length);
      const wp = WEAK_POINT_MUSCLES.reduce((a, k) => a + (m[k] ?? 0), 0);
      const benchmarks = bms.flatMap((b) => b.results.filter((r) => r.date >= from && r.date <= to).map((r) => ({ name: b.name, label: r.label, pr: r.pr })));
      return {
        blockNumber,
        from,
        to,
        sessions: ss.length,
        deloadSessions: ss.filter((s) => s.deload).length,
        weeks,
        liftChanges,
        weakPointSetsPerWeek: wp / weeks,
        benchmarks,
      };
    });
}

// ------------------------------------------------------------------ body

export interface BodyEntry {
  date: string;
  bodyweightKg?: number;
  girthsCm?: Record<string, number>;
}

export function bodySeries(entries: BodyEntry[], key: 'bodyweight' | string): { date: string; value: number }[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ date: e.date, value: key === 'bodyweight' ? e.bodyweightKg : e.girthsCm?.[key] }))
    .filter((p): p is { date: string; value: number } => p.value != null && Number.isFinite(p.value));
}
