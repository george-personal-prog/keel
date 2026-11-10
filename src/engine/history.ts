/** Read-only queries over the training history. */

import { bestSetE1rm } from './e1rm';
import { anchorChain } from './movements/library';
import type { History, LoggedExercise, LoggedSet, SessionLog } from './types';
import { daysBetween } from './util';

export interface Exposure {
  date: string;
  sessionNumber: number;
  deload: boolean;
  exercise: LoggedExercise;
}

/** Sessions sorted oldest -> newest. */
export function sortedSessions(history: History): SessionLog[] {
  return [...history.sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sessionNumber - b.sessionNumber,
  );
}

/** Exposures to a movement, most recent first. Deload sessions excluded unless asked. */
export function exposures(history: History, movementId: string, includeDeload = false): Exposure[] {
  const out: Exposure[] = [];
  const sessions = sortedSessions(history);
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.deload && !includeDeload) continue;
    for (const ex of s.exercises) {
      if (ex.movementId === movementId && ex.sets.some(isWorkSet)) {
        out.push({ date: s.date, sessionNumber: s.sessionNumber, deload: s.deload, exercise: ex });
      }
    }
  }
  return out;
}

export function isWorkSet(s: LoggedSet): boolean {
  return s.kind !== 'warmup' && s.reps > 0;
}

export function workSets(ex: LoggedExercise): LoggedSet[] {
  return ex.sets.filter(isWorkSet);
}

export function lastSessionDate(history: History): string | undefined {
  const s = sortedSessions(history);
  return s.length ? s[s.length - 1].date : undefined;
}

const ROLLING_WEIGHTS = [0.5, 0.3, 0.2];

/**
 * Rolling e1RM for a movement: best-set e1RM of the last three exposures, weighted 50/30/20
 * toward the most recent. One bad day moves it, but doesn't crater it.
 */
export function rollingE1rm(history: History, movementId: string): number | undefined {
  const xs = exposures(history, movementId)
    .map((e) => bestSetE1rm(e.exercise.sets))
    .filter((x) => x > 0)
    .slice(0, 3);
  if (!xs.length) return undefined;
  const w = ROLLING_WEIGHTS.slice(0, xs.length);
  const wsum = w.reduce((a, b) => a + b, 0);
  return xs.reduce((acc, x, i) => acc + x * w[i], 0) / wsum;
}

export interface E1rmEstimate {
  e1rm: number;
  source: 'history' | 'anchor';
  /** Human-readable source, e.g. "from Back Squat × 0.80". */
  via?: string;
  anchorId?: string;
  ratio?: number;
}

/** e1RM from this movement's own history, else via its anchor chain (track switches, rotations). */
export function estimateE1rm(history: History, movementId: string): E1rmEstimate | undefined {
  const own = rollingE1rm(history, movementId);
  if (own) return { e1rm: own, source: 'history' };
  for (const link of anchorChain(movementId)) {
    const base = rollingE1rm(history, link.movementId);
    if (base) {
      return { e1rm: base * link.ratio, source: 'anchor', anchorId: link.movementId, ratio: link.ratio };
    }
  }
  return undefined;
}

/** Olympic lifts: best successfully completed load (reps ≥ 1, technique not flagged) in recent history. */
export function bestCleanLift(history: History, movementId: string, maxExposures = 20): number | undefined {
  let best = 0;
  for (const e of exposures(history, movementId).slice(0, maxExposures)) {
    for (const s of workSets(e.exercise)) {
      if (s.loadKg == null || s.techniquePoor) continue;
      if (s.targetReps != null && s.reps < s.targetReps) continue;
      best = Math.max(best, s.loadKg);
    }
  }
  return best || undefined;
}

export function skipsSince(history: History, sinceIso: string | undefined, today: string) {
  return history.skips.filter(
    (s) => (!sinceIso || s.date > sinceIso) && s.date <= today,
  );
}

export function skipsInWindow(history: History, today: string, days: number) {
  return history.skips.filter((s) => {
    const d = daysBetween(s.date, today);
    return d >= 0 && d < days;
  });
}
