/**
 * Track-state reducers. Pure functions: (state, event) -> new state.
 * The UI calls these after the user acts; the engine reads the result.
 */

import { swapOptions, hasMovement } from './movements/library';
import { blockInfo, phaseLength } from './periodisation';
import { currentDay, resolveMovement } from './generate';
import { slotKey, splitFor } from './templates';
import type { SessionPrescription, Track, TrackState } from './types';

export const CURRENT_SCHEMA_VERSION = 1 as const;

export function createInitialState(track: Track, seed = 1): TrackState {
  validateTrack(track);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    track,
    cursor: 0,
    blockNumber: 1,
    blockStartSession: 0,
    completedSessions: 0,
    calibrated: false,
    swaps: {},
    seed,
  };
}

export function validateTrack(track: Track): void {
  if (![3, 4, 5, 6].includes(track.frequency)) throw new Error(`Invalid frequency ${track.frequency}`);
  if (track.focus !== 'competition' && track.focus !== 'off-season') throw new Error(`Invalid focus ${track.focus}`);
  if (track.competitionDate && !/^\d{4}-\d{2}-\d{2}$/.test(track.competitionDate)) {
    throw new Error(`Invalid competition date ${track.competitionDate}`);
  }
}

function rollBlock(state: TrackState): TrackState {
  const next: TrackState = {
    ...state,
    blockNumber: state.blockNumber + 1,
    blockStartSession: state.completedSessions,
    swaps: {},
  };
  if (state.pendingTrack) {
    next.track = state.pendingTrack;
    next.pendingTrack = undefined;
    next.cursor = 0;
  }
  return next;
}

/**
 * Advance the queue after a session is completed (fully or partially).
 * `prescription` is the session the user was given, so the reducer knows its phase.
 */
export function completeSession(state: TrackState, prescription: SessionPrescription, today: string): TrackState {
  const splitLen = splitFor(state.track.focus, state.track.frequency).length;
  let next: TrackState = { ...state, cursor: state.cursor + 1, completedSessions: state.completedSessions + 1 };

  if (prescription.phase === 'calibration') {
    if (next.cursor >= splitLen) {
      next = { ...next, calibrated: true, cursor: 0, blockNumber: 1, blockStartSession: next.completedSessions };
    }
    return next;
  }

  if (prescription.phase === 'deload') {
    // Deload sessions don't count toward block weeks.
    next.blockStartSession += 1;
    const remaining = state.deload ? state.deload.sessionsRemaining - 1 : state.track.frequency - 1;
    if (remaining <= 0) {
      next = rollBlock({ ...next, deload: undefined, lastDeloadEndDate: today, deloadDeclinedDate: undefined });
    } else {
      next.deload = { startedAtSession: state.deload?.startedAtSession ?? next.completedSessions, sessionsRemaining: remaining };
    }
    return next;
  }

  const weeksDone = Math.floor((next.completedSessions - next.blockStartSession) / state.track.frequency);
  const after = blockInfo(next, today);
  const phaseChanged = after.phase !== prescription.phase;
  if (weeksDone >= phaseLength(prescription.phase) || phaseChanged) {
    next = rollBlock(next);
  }
  return next;
}

export type TrackChangeTiming = 'now' | 'next-block';

/**
 * Switch focus/frequency. e1RMs live on movements, not tracks, so nothing is recalibrated.
 * - 'now': new split from its first day, fresh block.
 * - 'next-block': queued; applied when the current block ends.
 */
export function changeTrack(state: TrackState, track: Track, timing: TrackChangeTiming): TrackState {
  validateTrack(track);
  if (timing === 'next-block') return { ...state, pendingTrack: track };
  const sameSplit = track.focus === state.track.focus && track.frequency === state.track.frequency;
  if (sameSplit) return { ...state, track, pendingTrack: undefined };
  return {
    ...state,
    track,
    pendingTrack: undefined,
    cursor: 0,
    blockNumber: state.calibrated ? state.blockNumber + 1 : state.blockNumber,
    blockStartSession: state.completedSessions,
    swaps: {},
  };
}

/**
 * Swap the movement in a slot of today's session for the rest of the block.
 * Only same-pattern, non-restricted alternatives are accepted.
 */
export function swapExercise(state: TrackState, slotId: string, newMovementId: string): TrackState {
  const day = currentDay(state);
  const slot = day.slots.find((s) => s.id === slotId);
  if (!slot) throw new Error(`Unknown slot ${slotId} on ${day.id}`);
  if (!hasMovement(newMovementId)) throw new Error(`Movement ${newMovementId} is not allowed`);
  const key = slotKey(day.id, slot.id);
  const withoutSwap = { ...state, swaps: { ...state.swaps } };
  delete withoutSwap.swaps[key];
  const original = resolveMovement(withoutSwap, day, slot);
  if (newMovementId === original) return withoutSwap;
  if (!swapOptions(original).includes(newMovementId)) {
    throw new Error(`${newMovementId} is not an equivalent swap for ${original}`);
  }
  return { ...state, swaps: { ...state.swaps, [key]: newMovementId } };
}

export function declineDeload(state: TrackState, today: string): TrackState {
  return { ...state, deloadDeclinedDate: today };
}

/** Schema migrations live here. v1 is the first version. */
export function migrateState(raw: unknown): TrackState {
  const s = raw as Partial<TrackState> & { schemaVersion?: number };
  if (s.schemaVersion === CURRENT_SCHEMA_VERSION) return s as TrackState;
  throw new Error(`Unsupported track state schema version: ${String(s.schemaVersion)}`);
}
