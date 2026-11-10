/** Hard-set accounting per muscle (prime mover = 1 set, synergist = 0.5). */

import { prescribeNextSession } from './generate';
import { findMovement } from './movements/library';
import { completeSession } from './state';
import { splitFor } from './templates';
import type { History, Muscle, SessionLog, SessionPrescription, Settings, TrackState } from './types';

export type MuscleSets = Partial<Record<Muscle, number>>;

export function addSets(acc: MuscleSets, movementId: string, sets: number): void {
  const m = findMovement(movementId);
  if (!m) return;
  for (const [muscle, w] of Object.entries(m.muscles) as [Muscle, number][]) {
    acc[muscle] = (acc[muscle] ?? 0) + w * sets;
  }
}

export function prescribedSetsByMuscle(sessions: SessionPrescription[]): MuscleSets {
  const acc: MuscleSets = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const hard = ex.sets.filter((x) => x.kind !== 'warmup').length;
      addSets(acc, ex.movementId, hard);
    }
  }
  return acc;
}

export function loggedSetsByMuscle(sessions: SessionLog[]): MuscleSets {
  const acc: MuscleSets = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const hard = ex.sets.filter((x) => x.kind !== 'warmup' && x.reps > 0 && (x.rir == null || x.rir <= 4)).length;
      addSets(acc, ex.movementId, hard);
    }
  }
  return acc;
}

/** Generate one full pass through the split (a "week") from a state, for planning/analytics. */
export function plannedWeek(settings: Settings, state: TrackState, today: string, history: History = { sessions: [], skips: [] }): SessionPrescription[] {
  const n = splitFor(state.track.focus, state.track.frequency).length;
  const out: SessionPrescription[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const p = prescribeNextSession({ settings, state: s, history, today });
    out.push(p);
    s = { ...completeSession(s, p, today), blockNumber: s.blockNumber, blockStartSession: s.blockStartSession };
  }
  return out;
}
