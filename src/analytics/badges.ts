/**
 * Achievements, replayed from history (nothing stored, so they can never drift).
 *
 * - Records (dated events): e1RM PRs, rep PRs, benchmark PRs.
 * - Badges (earned once): sessions logged, calibration, consistency streaks, blocks completed,
 *   weak-point volume milestones, first benchmark.
 * Every badge is something real the user did, with the evidence in `detail`.
 */

import { BENCHMARKS, getMovement, type History, type Muscle, type SessionLog } from '../engine';
import { addSets, type MuscleSets } from '../engine/volume';
import { bestSetE1rm } from '../engine/e1rm';
import { addDays } from '../engine/util';
import { MAIN_LIFTS, scoreLabel, scoreValue, weekStart } from './index';

export type AchievementKind = 'e1rm-pr' | 'rep-pr' | 'benchmark-pr' | 'badge';
export type BadgeCategory = 'milestone' | 'consistency' | 'block' | 'weak-point' | 'engine';

export interface Achievement {
  id: string;
  kind: AchievementKind;
  category?: BadgeCategory;
  title: string;
  detail: string;
  date: string;
  sessionId?: string;
  tier?: 1 | 2 | 3;
}

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  title: string;
  hint: string;
  tier: 1 | 2 | 3;
}

const SESSION_MILESTONES = [1, 10, 25, 50, 100, 200, 365];
const STREAKS = [4, 8, 12, 26, 52];
const BLOCKS = [1, 3, 6, 12];
const WEAK_SET_MILESTONES = [250, 500, 1000];
const WEAK_LABEL: Partial<Record<Muscle, string>> = { 'delts-side': 'Side delts', 'delts-rear': 'Rear delts', 'chest-upper': 'Upper chest', lats: 'Lats' };

const tierOf = (i: number, n: number): 1 | 2 | 3 => (i >= n - 2 ? 3 : i >= Math.floor(n / 2) ? 2 : 1);

/** Every badge that can be earned, for the locked/unlocked grid. */
export function badgeCatalog(): BadgeDef[] {
  return [
    ...SESSION_MILESTONES.map((n, i) => ({
      id: `sessions-${n}`,
      category: 'milestone' as const,
      title: n === 1 ? 'Keel laid' : `${n} sessions`,
      hint: n === 1 ? 'Log your first session' : `Log ${n} sessions`,
      tier: tierOf(i, SESSION_MILESTONES.length),
    })),
    { id: 'calibrated', category: 'milestone', title: 'Calibrated', hint: 'Finish calibration week', tier: 1 },
    ...STREAKS.map((n, i) => ({
      id: `streak-${n}`,
      category: 'consistency' as const,
      title: `${n}-week streak`,
      hint: `Hit your weekly target ${n} weeks in a row`,
      tier: tierOf(i, STREAKS.length),
    })),
    ...BLOCKS.map((n, i) => ({
      id: `blocks-${n}`,
      category: 'block' as const,
      title: n === 1 ? 'First block' : `${n} blocks`,
      hint: `Complete ${n} training block${n > 1 ? 's' : ''}`,
      tier: tierOf(i, BLOCKS.length),
    })),
    ...Object.entries(WEAK_LABEL).flatMap(([m, label]) =>
      WEAK_SET_MILESTONES.map((n, i) => ({
        id: `weak-${m}-${n}`,
        category: 'weak-point' as const,
        title: `${label} ${n}`,
        hint: `${n} hard sets for ${label!.toLowerCase()}`,
        tier: (i + 1) as 1 | 2 | 3,
      })),
    ),
    { id: 'first-benchmark', category: 'engine', title: 'On the board', hint: 'Log your first benchmark or erg test', tier: 1 },
    { id: 'benchmark-prs-5', category: 'engine', title: 'Engine builder', hint: 'Set 5 benchmark PRs', tier: 2 },
  ];
}

const CATALOG = new Map(badgeCatalog().map((b) => [b.id, b]));

function badge(id: string, date: string, detail: string, sessionId?: string): Achievement {
  const def = CATALOG.get(id)!;
  return { id, kind: 'badge', category: def.category, title: def.title, detail, date, sessionId, tier: def.tier };
}

export function computeAchievements(history: History, frequency: number): Achievement[] {
  const sessions: SessionLog[] = [...history.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.sessionNumber - b.sessionNumber);
  const out: Achievement[] = [];
  const bestE1 = new Map<string, number>();
  const seenLift = new Map<string, number>();
  const repBest = new Map<string, Map<number, number>>();
  const bmBest = new Map<string, number>();
  const muscles: MuscleSets = {};
  const earned = new Set<string>();
  let bmPRs = 0;
  let calibrationSessions = 0;
  const maxBlockSeen = { n: 0 };

  const earn = (id: string, date: string, detail: string, sessionId?: string) => {
    if (earned.has(id)) return;
    earned.add(id);
    out.push(badge(id, date, detail, sessionId));
  };

  sessions.forEach((s, idx) => {
    const n = idx + 1;
    if (SESSION_MILESTONES.includes(n)) earn(`sessions-${n}`, s.date, n === 1 ? 'Your first logged session.' : `${n} sessions logged.`, s.id);

    if (s.phase === 'calibration') calibrationSessions++;
    else if (calibrationSessions > 0) earn('calibrated', s.date, 'Working weights and baselines set.', s.id);

    if (s.blockNumber != null && s.phase !== 'calibration') {
      if (maxBlockSeen.n && s.blockNumber > maxBlockSeen.n) {
        const completed = s.blockNumber - 1;
        for (const b of BLOCKS) if (completed >= b) earn(`blocks-${b}`, s.date, `${completed} block${completed > 1 ? 's' : ''} completed.`, s.id);
      }
      maxBlockSeen.n = Math.max(maxBlockSeen.n, s.blockNumber);
    }

    for (const ex of s.exercises) {
      const hard = ex.sets.filter((x) => x.kind !== 'warmup' && x.reps > 0);
      addSets(muscles, ex.movementId, hard.length);
      if (s.deload || ex.scheme === 'olympic') continue;
      const name = getMovement(ex.movementId).name;

      // e1RM PRs on main lifts, after the first two exposures (so calibration isn't a "PR")
      if (MAIN_LIFTS.includes(ex.movementId)) {
        const e1 = bestSetE1rm(ex.sets);
        const prev = bestE1.get(ex.movementId) ?? 0;
        const seen = seenLift.get(ex.movementId) ?? 0;
        if (e1 && seen >= 2 && e1 > prev * 1.005) {
          out.push({ id: `e1rm-${ex.movementId}-${s.id}`, kind: 'e1rm-pr', title: `${name} e1RM`, detail: `${e1.toFixed(1)} kg (+${(e1 - prev).toFixed(1)})`, date: s.date, sessionId: s.id });
        }
        if (e1) bestE1.set(ex.movementId, Math.max(prev, e1));
        seenLift.set(ex.movementId, seen + 1);
      }

      // rep PRs on compound lifts (1–12 reps), after the first exposure
      if (!getMovement(ex.movementId).tags.includes('compound')) continue;
      const reps = repBest.get(ex.movementId) ?? new Map<number, number>();
      const firstTime = !repBest.has(ex.movementId);
      for (const x of hard) {
        if (x.loadKg == null || x.reps > 12) continue;
        const prev = reps.get(x.reps);
        // beaten only if no heavier load exists at >= these reps
        const dominated = [...reps.entries()].some(([r, l]) => r >= x.reps && l >= x.loadKg!);
        if (!firstTime && !dominated && prev != null && x.loadKg > prev) {
          out.push({ id: `rep-${ex.movementId}-${x.reps}-${s.id}`, kind: 'rep-pr', title: `${name} ${x.reps}RM`, detail: `${x.loadKg} kg × ${x.reps}`, date: s.date, sessionId: s.id });
        }
        if (prev == null || x.loadKg > prev) reps.set(x.reps, x.loadKg);
      }
      repBest.set(ex.movementId, reps);
    }

    for (const [m, label] of Object.entries(WEAK_LABEL)) {
      const total = muscles[m as Muscle] ?? 0;
      for (const t of WEAK_SET_MILESTONES) if (total >= t) earn(`weak-${m}-${t}`, s.date, `${t} hard sets for ${label!.toLowerCase()}.`, s.id);
    }

    const c = s.conditioning;
    if (c && (c.wodId.startsWith('bm:') || c.wodId.startsWith('test:'))) {
      earn('first-benchmark', s.date, `${c.name}: ${scoreLabel(c)}.`, s.id);
      const v = scoreValue(c);
      if (v && c.score.rx !== false) {
        const prev = bmBest.get(c.wodId);
        const better = prev == null ? false : v.direction === 'lower' ? v.value < prev : v.value > prev;
        if (better) {
          bmPRs++;
          out.push({ id: `bm-${c.wodId}-${s.id}`, kind: 'benchmark-pr', title: c.name, detail: `New best: ${scoreLabel(c)}`, date: s.date, sessionId: s.id });
          if (bmPRs >= 5) earn('benchmark-prs-5', s.date, '5 benchmark PRs.', s.id);
        }
        if (prev == null || better) bmBest.set(c.wodId, v.value);
      }
    }
  });

  // Consistency streaks: consecutive full weeks meeting the target frequency.
  if (sessions.length) {
    let ws = weekStart(sessions[0].date);
    const last = weekStart(sessions[sessions.length - 1].date);
    let streak = 0;
    while (ws <= last) {
      const end = addDays(ws, 7);
      const n = sessions.filter((s) => s.date >= ws && s.date < end).length;
      streak = n >= frequency ? streak + 1 : 0;
      for (const t of STREAKS) if (streak >= t) earn(`streak-${t}`, addDays(ws, 6), `${t} weeks in a row at ${frequency}+ sessions.`);
      ws = end;
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function achievementsForSession(all: Achievement[], sessionId: string): Achievement[] {
  return all.filter((a) => a.sessionId === sessionId);
}

export function benchmarkName(id: string): string {
  return BENCHMARKS.find((b) => b.id === id)?.name ?? id;
}
