/**
 * Test helpers: fixtures and a simulated athlete.
 *
 * The simulated athlete has "true" e1RMs per movement. Given a prescription it performs sets
 * honestly: reps stop at the target RIR, RIR is reported from true reps-to-failure.
 * Strength can grow per session, so multi-week simulations exercise real progression paths.
 */

import { DEFAULT_SETTINGS } from '../defaults';
import { loadFor } from '../e1rm';
import { prescribeNextSession } from '../generate';
import { roundLoad } from '../loading';
import { getMovement } from '../movements/library';
import { completeSession, createInitialState } from '../state';
import type {
  EngineInput,
  ExercisePrescription,
  History,
  LoggedExercise,
  LoggedSet,
  SessionLog,
  SessionPrescription,
  Settings,
  Track,
  TrackState,
} from '../types';
import { addDays } from '../util';

export const settings: Settings = structuredClone(DEFAULT_SETTINGS);

export const emptyHistory = (): History => ({ sessions: [], skips: [] });

export function calibratedState(track: Track, extra: Partial<TrackState> = {}): TrackState {
  return { ...createInitialState(track), calibrated: true, ...extra };
}

export function input(state: TrackState, history: History, today = '2026-01-05', options?: EngineInput['options']): EngineInput {
  return { settings, state, history, today, options };
}

let idCounter = 0;
export function log(date: string, exercises: LoggedExercise[], extra: Partial<SessionLog> = {}): SessionLog {
  idCounter++;
  return {
    id: `s${idCounter}`,
    date,
    sessionNumber: idCounter,
    dayTypeId: 'test',
    phase: 'hypertrophy',
    deload: false,
    partial: false,
    exercises,
    ...extra,
  };
}

export function ex(movementId: string, sets: Partial<LoggedSet>[], extra: Partial<LoggedExercise> = {}): LoggedExercise {
  return {
    slotKey: `test:${movementId}`,
    movementId,
    scheme: 'strength',
    sets: sets.map((s) => ({ kind: 'working', loadKg: 100, reps: 5, rir: 2, ...s })),
    ...extra,
  };
}

// ----------------------------------------------------------------------------- athlete

export const BASE_TRUE_E1RM: Record<string, number> = {
  'back-squat': 160,
  'front-squat': 132,
  deadlift: 200,
  'incline-bench-press': 105,
  'bench-press': 125,
  snatch: 90,
  clean: 120,
  'clean-and-jerk': 115,
};

const DEFAULTS_BY_LOADTYPE: Record<string, number> = {
  dumbbell: 34,
  cable: 45,
  machine: 110,
  'plate-loaded': 140,
  kettlebell: 32,
  barbell: 90,
  'weighted-bodyweight': 30,
};

export interface Athlete {
  trueE1rm: Record<string, number>;
  /** Fractional strength gain per completed session (e.g. 0.004 ≈ +0.4%). */
  gainPerSession: number;
  /** Systematic RIR reporting bias (positive = sandbagging). */
  rirBias: number;
  /** Override behaviour per set. */
  perform?: (ex: ExercisePrescription, set: LoggedSet) => LoggedSet;
}

export function athlete(partial: Partial<Athlete> = {}): Athlete {
  return { trueE1rm: { ...BASE_TRUE_E1RM }, gainPerSession: 0.003, rirBias: 0, ...partial };
}

/** True e1RM; derived values are memoised so every movement gets stronger over time. */
export function trueMax(a: Athlete, movementId: string): number {
  if (a.trueE1rm[movementId]) return a.trueE1rm[movementId];
  const m = getMovement(movementId);
  const v =
    m.anchor && a.trueE1rm[m.anchor.movementId]
      ? a.trueE1rm[m.anchor.movementId] * m.anchor.ratio
      : m.pattern === 'lateral-delt' || m.pattern === 'rear-delt'
        ? 22
        : (DEFAULTS_BY_LOADTYPE[m.loadType] ?? 50);
  a.trueE1rm[movementId] = v;
  return v;
}

/** Perform a prescription and return the session log. */
export function perform(a: Athlete, p: SessionPrescription, date: string): SessionLog {
  const exercises: LoggedExercise[] = p.exercises.map((e) => {
    const m = getMovement(e.movementId);
    const tm = trueMax(a, e.movementId);
    let topLoad: number | null = null;
    const sets: LoggedSet[] = e.sets.map((s) => {
      let load = s.loadKg;
      if (load == null && m.loadType !== 'bodyweight' && m.loadType !== 'none' && m.loadType !== 'erg') {
        // Calibration / "find a load": choose honestly for the target, back-offs at 90% of top.
        const target = s.kind === 'backoff' && topLoad ? topLoad * 0.9 : loadFor(tm, s.reps, s.targetRir);
        load = roundLoad(target, m, settings.equipment, 'down');
      }
      if (s.kind === 'top' || s.kind === 'calibration') topLoad = load;
      const rtf = load == null || load <= 0 ? 12 : Math.max(0, 30 * (tm / load - 1));
      const maxReps = s.repRange ? s.repRange[1] : s.reps;
      const reps = Math.max(0, Math.min(maxReps, Math.floor(rtf - s.targetRir)));
      const done = s.repRange ? Math.max(reps, 0) : Math.min(s.reps, Math.floor(rtf));
      const rir = Math.max(0, Math.min(4, Math.round(rtf - done) + a.rirBias));
      let set: LoggedSet = { kind: s.kind, loadKg: load, reps: done, rir, targetReps: s.reps, targetRir: s.targetRir };
      if (a.perform) set = a.perform(e, set);
      return set;
    });
    return { slotKey: e.slotKey, movementId: e.movementId, scheme: e.scheme, repRange: e.sets[0]?.repRange, sets };
  });
  const c = p.conditioning;
  return {
    id: `${p.sessionNumber}-${date}`,
    date,
    sessionNumber: p.sessionNumber,
    dayTypeId: p.dayTypeId,
    phase: p.phase,
    deload: p.phase === 'deload',
    partial: false,
    exercises,
    conditioning: c
      ? {
          wodId: c.id,
          name: c.name,
          format: c.format,
          scoreType: c.scoreType,
          benchmark: c.benchmark,
          score: c.id === 'test:row-2k' ? { timeSec: 400 } : c.id === 'test:air-bike-10' ? { calories: 180 } : c.id === 'test:ski-1k' ? { timeSec: 220 } : { timeSec: 420 },
        }
      : undefined,
  };
}

export interface SimResult {
  state: TrackState;
  history: History;
  prescriptions: SessionPrescription[];
  date: string;
}

/**
 * Run `sessions` sessions, training on consecutive "training days" (every 7/frequency days).
 */
export function simulate(
  track: Track,
  sessions: number,
  a: Athlete = athlete(),
  start: { state?: TrackState; history?: History; date?: string } = {},
): SimResult {
  let state = start.state ?? createInitialState(track, 7);
  const history: History = start.history ?? emptyHistory();
  const startDate = start.date ?? '2026-01-05';
  let date = startDate;
  const prescriptions: SessionPrescription[] = [];
  for (let i = 0; i < sessions; i++) {
    date = addDays(startDate, Math.floor((i * 7) / track.frequency));
    const p = prescribeNextSession({ settings, state, history, today: date });
    prescriptions.push(p);
    history.sessions.push(perform(a, p, date));
    state = completeSession(state, p, date);
    for (const k of Object.keys(a.trueE1rm)) a.trueE1rm[k] *= 1 + a.gainPerSession;
  }
  date = addDays(startDate, Math.floor((sessions * 7) / track.frequency));
  return { state, history, prescriptions, date };
}

export const ALL_TRACKS: Track[] = (['off-season', 'competition'] as const).flatMap((focus) =>
  ([3, 4, 5, 6] as const).map((frequency) => ({ focus, frequency })),
);
