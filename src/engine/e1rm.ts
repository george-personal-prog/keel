/**
 * Estimated 1RM from load × reps × RIR.
 *
 * Model: Epley on "reps to failure" (reps + RIR):  e1RM = load × (1 + (reps + RIR) / 30).
 * - RIR is the user's own rating, so a set of 5 @ RIR 2 is treated as a 7RM.
 * - RIR "4+" is stored as 4 (conservative).
 * - Sets with reps + RIR > 12 are flagged low-confidence: Epley drifts at high reps,
 *   so hypertrophy work is progressed on actual load/reps, not e1RM.
 */

import type { LoggedSet } from './types';

export const MAX_RELIABLE_RTF = 12;

export function repsToFailure(reps: number, rir: number | null): number {
  return reps + (rir ?? 0);
}

export function e1rm(loadKg: number, reps: number, rir: number | null): number {
  if (loadKg <= 0 || reps <= 0) return 0;
  const rtf = repsToFailure(reps, rir);
  if (rtf <= 1) return loadKg;
  return loadKg * (1 + rtf / 30);
}

/** Fraction of e1RM that should allow `reps` reps leaving `rir` in reserve. */
export function loadFraction(reps: number, rir: number): number {
  const rtf = reps + rir;
  if (rtf <= 1) return 1;
  return 1 / (1 + rtf / 30);
}

/** Load (unrounded) for a target reps/RIR given an e1RM. */
export function loadFor(e1rmKg: number, reps: number, rir: number): number {
  return e1rmKg * loadFraction(reps, rir);
}

/** Best e1RM among a list of logged sets (working/top/backoff/calibration only). */
export function bestSetE1rm(sets: LoggedSet[]): number {
  let best = 0;
  for (const s of sets) {
    if (s.kind === 'warmup' || s.loadKg == null) continue;
    if (repsToFailure(s.reps, s.rir) > MAX_RELIABLE_RTF + 3) continue;
    best = Math.max(best, e1rm(s.loadKg, s.reps, s.rir));
  }
  return best;
}
