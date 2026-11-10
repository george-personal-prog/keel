/**
 * Deloads only when the data justifies them.
 *
 * Evidence, per core movement (≥ 4 recent non-deload exposures):
 *   - e1RM regression: mean of last 2 exposures < 97% of the best of the 4 before.
 *   - e1RM stall:      best of last 3 exposures ≤ best of the previous 3 (+0.5%).
 *   - effort creep:    same load and reps feel ≥ 2 RIR harder than a recent exposure.
 * Session-level evidence:
 *   - missed targets on ≥ 40% of exercises across the last 2 sessions.
 *   - ≥ 3 low-motivation skips in 21 days.
 *
 * A deload triggers when the evidence is broad (several lifts regressing, or a plateau across at
 * least half of them), or a regression is corroborated by missed targets / motivation skips.
 * One lift wobbling never triggers it.
 * After 8 weeks without a deload and no evidence, the user gets a *review* prompt, not a deload.
 */

import { bestSetE1rm } from './e1rm';
import { exposures, skipsInWindow, sortedSessions, workSets } from './history';
import { findMovement } from './movements/library';
import type { DeloadEvidence, History, TrackState } from './types';
import { daysBetween, mean } from './util';

export const MIN_WEEKS_BETWEEN_DELOADS = 3;
export const REVIEW_AFTER_WEEKS = 8;
export const DECLINE_SUPPRESS_DAYS = 14;

export interface DeloadAssessment {
  trigger: boolean;
  evidence: DeloadEvidence[];
  reviewDue: boolean;
  weeksSinceDeload: number;
  score: number;
  assessed: number;
}

export function assessDeload(history: History, state: TrackState, today: string): DeloadAssessment {
  const sessions = sortedSessions(history).filter((s) => !s.deload);
  const sinceIso = state.lastDeloadEndDate ?? sessions[0]?.date ?? today;
  const weeksSinceDeload = Math.floor(daysBetween(sinceIso, today) / 7);
  const evidence: DeloadEvidence[] = [];

  // Movements trained in the last 3 weeks.
  const recentIds = new Set<string>();
  for (const s of sessions) {
    if (daysBetween(s.date, today) <= 21) for (const ex of s.exercises) recentIds.add(ex.movementId);
  }

  let score = 0;
  let assessed = 0;
  let stalls = 0;
  let hardSignals = 0;
  for (const id of recentIds) {
    // Olympic lifts are technique-gated (misses handled in progression), not judged on e1RM.
    if (sessions.some((s) => s.exercises.some((e) => e.movementId === id && e.scheme === 'olympic'))) continue;
    // Added load on bodyweight movements isn't a meaningful e1RM without bodyweight.
    const lt = findMovement(id)?.loadType;
    if (lt === 'weighted-bodyweight' || lt === 'bodyweight') continue;
    const xs = exposures(history, id).filter((e) => !state.lastDeloadEndDate || e.date > state.lastDeloadEndDate);
    const e1 = xs.map((e) => bestSetE1rm(e.exercise.sets)).filter((x) => x > 0);
    if (e1.length < 4) continue;
    assessed++;
    const name = findMovement(id)?.name ?? id;
    let liftScore = 0;

    const recent = mean(e1.slice(0, 2));
    const priorBest = Math.max(...e1.slice(2, 6));
    if (recent < priorBest * 0.97) {
      liftScore = 1;
      hardSignals++;
      evidence.push({ movementId: id, kind: 'e1rm-regression', detail: `${name}: e1RM ${recent.toFixed(1)} vs ${priorBest.toFixed(1)} peak (−${((1 - recent / priorBest) * 100).toFixed(1)}%).` });
    } else if (e1.length >= 6 && Math.max(...e1.slice(0, 3)) <= Math.max(...e1.slice(3, 6)) * 1.005) {
      liftScore = 0.5;
      stalls++;
      evidence.push({ movementId: id, kind: 'e1rm-stall', detail: `${name}: no e1RM progress across the last 6 exposures.` });
    }

    // Effort creep: most recent best set vs an earlier set at the same load with ≥ reps.
    const latest = workSets(xs[0].exercise).filter((s) => s.loadKg != null && s.rir != null);
    const earlier = xs.slice(1, 4).flatMap((e) => workSets(e.exercise)).filter((s) => s.loadKg != null && s.rir != null);
    const creep = latest.find((l) =>
      earlier.some((p) => Math.abs((p.loadKg ?? 0) - (l.loadKg ?? 0)) <= (l.loadKg ?? 0) * 0.01 && p.reps >= l.reps && (p.rir ?? 0) - (l.rir ?? 0) >= 2),
    );
    if (creep) {
      liftScore = Math.min(1, liftScore + 0.5);
      hardSignals++;
      evidence.push({ movementId: id, kind: 'effort-creep', detail: `${name}: ${creep.loadKg} kg × ${creep.reps} now at RIR ${creep.rir}, ≥ 2 RIR harder than recently.` });
    }
    score += liftScore;
  }

  // Missed targets across the last two sessions.
  const lastTwo = sessions.slice(-2);
  const exs = lastTwo.flatMap((s) => s.exercises);
  // Hypertrophy targets are aspirational (+1 rep); only falling below the rep range counts.
  const floorOf = (ex: (typeof exs)[number], s: { targetReps?: number }) => (ex.repRange ? ex.repRange[0] : s.targetReps);
  const withTargets = exs.filter((ex) => ex.sets.some((s) => floorOf(ex, s) != null));
  const missed = withTargets.filter((ex) =>
    workSets(ex).some((s) => {
      const floor = floorOf(ex, s);
      return floor != null && s.reps < floor;
    }),
  );
  const missedRate = withTargets.length ? missed.length / withTargets.length : 0;
  const missedFlag = withTargets.length >= 4 && missedRate >= 0.4;
  if (missedFlag) {
    evidence.push({ kind: 'missed-targets', detail: `Missed rep targets on ${missed.length}/${withTargets.length} exercises in the last 2 sessions.` });
  }

  const motivation = skipsInWindow(history, today, 21).filter((s) => s.reason === 'motivation').length;
  const motivationFlag = motivation >= 3;
  if (motivationFlag) {
    evidence.push({ kind: 'motivation-skips', detail: `${motivation} low-motivation skips in the last 3 weeks.` });
  }

  // Broad = several lifts going backwards, or a plateau across at least half of them.
  const broad =
    (hardSignals >= 2 && score >= 2 && assessed > 0 && score / assessed >= 0.25) ||
    (stalls >= 3 && assessed > 0 && stalls / assessed >= 0.5);
  const corroborated = hardSignals >= 1 && score >= 1 && (missedFlag || motivationFlag);
  const allowed =
    state.calibrated &&
    !state.deload &&
    weeksSinceDeload >= MIN_WEEKS_BETWEEN_DELOADS &&
    !(state.deloadDeclinedDate && daysBetween(state.deloadDeclinedDate, today) < DECLINE_SUPPRESS_DAYS);
  const trigger = allowed && (broad || corroborated);

  return {
    trigger,
    evidence,
    reviewDue: !trigger && state.calibrated && weeksSinceDeload >= REVIEW_AFTER_WEEKS,
    weeksSinceDeload,
    score,
    assessed,
  };
}
