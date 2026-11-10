/**
 * The in-progress session ("draft"). Pure functions only, so they're unit-testable and the
 * draft can be persisted after every tap (iOS may kill a PWA in the background at any time).
 */

import type {
  ExercisePrescription,
  HeartRateEntry,
  LoggedSet,
  PrescribedSet,
  SessionLog,
  SessionPrescription,
  WodScore,
} from '../engine';

export interface DraftSet {
  prescribed: PrescribedSet;
  loadKg: number | null;
  reps: number;
  rir: number | null;
  done: boolean;
  techniquePoor?: boolean;
}

export interface DraftExercise {
  prescription: ExercisePrescription;
  sets: DraftSet[];
}

export interface DraftConditioning {
  score: WodScore;
  hr?: HeartRateEntry;
  done: boolean;
}

export interface Draft {
  id: 'current';
  startedAt: number;
  date: string;
  prescription: SessionPrescription;
  exercises: DraftExercise[];
  conditioning?: DraftConditioning;
  notes: string;
  rest?: { endsAt: number; durationSec: number; label: string };
}

export function createDraft(prescription: SessionPrescription, date: string, now: number): Draft {
  return {
    id: 'current',
    startedAt: now,
    date,
    prescription,
    exercises: prescription.exercises.map((p) => ({ prescription: p, sets: p.sets.map(fromPrescribed) })),
    conditioning: prescription.conditioning ? { score: { rx: true }, done: false } : undefined,
    notes: '',
  };
}

function fromPrescribed(s: PrescribedSet): DraftSet {
  return { prescribed: s, loadKg: s.loadKg, reps: s.reps, rir: s.targetRir, done: false };
}

function mapExercise(d: Draft, exIdx: number, fn: (e: DraftExercise) => DraftExercise): Draft {
  return { ...d, exercises: d.exercises.map((e, i) => (i === exIdx ? fn(e) : e)) };
}

/** Update one set (values and/or done). */
export function updateSet(d: Draft, exIdx: number, setIdx: number, patch: Partial<DraftSet>): Draft {
  return mapExercise(d, exIdx, (e) => ({ ...e, sets: e.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)) }));
}

/**
 * Change the load of a set and carry it to the later sets of the same kind that aren't done yet
 * ("edit target weight on the day"). After a calibration top set, back-off sets get ~90% of it
 * (rounded with `round`, e.g. to loadable plates).
 */
export function setLoad(d: Draft, exIdx: number, setIdx: number, loadKg: number | null, carry = true, round: (kg: number) => number = (x) => x): Draft {
  return mapExercise(d, exIdx, (e) => {
    const kind = e.sets[setIdx].prescribed.kind;
    return {
      ...e,
      sets: e.sets.map((s, i) => {
        if (i === setIdx) return { ...s, loadKg };
        if (!carry || i < setIdx || s.done) return s;
        if (kind === 'calibration' && s.prescribed.kind === 'backoff') return { ...s, loadKg: loadKg == null ? null : round(loadKg * 0.9) };
        if (s.prescribed.kind === kind) return { ...s, loadKg };
        return s;
      }),
    };
  });
}

/** The load to pre-fill for a set with no prescribed load (calibration): the last logged load. */
export function suggestedLoad(e: DraftExercise, setIdx: number): number | null {
  for (let i = setIdx - 1; i >= 0; i--) if (e.sets[i].loadKg != null) return e.sets[i].loadKg;
  return null;
}

export function replaceExercise(d: Draft, exIdx: number, prescription: ExercisePrescription): Draft {
  return mapExercise(d, exIdx, () => ({ prescription, sets: prescription.sets.map(fromPrescribed) }));
}

export function addSet(d: Draft, exIdx: number): Draft {
  return mapExercise(d, exIdx, (e) => {
    const last = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, { ...last, done: false }] };
  });
}

export function nextOpenSet(d: Draft): { exIdx: number; setIdx: number } | undefined {
  for (let exIdx = 0; exIdx < d.exercises.length; exIdx++) {
    const setIdx = d.exercises[exIdx].sets.findIndex((s) => !s.done);
    if (setIdx >= 0) return { exIdx, setIdx };
  }
  return undefined;
}

export function progress(d: Draft): number {
  const sets = d.exercises.flatMap((e) => e.sets);
  const total = sets.length + (d.conditioning ? 1 : 0);
  const done = sets.filter((s) => s.done).length + (d.conditioning?.done ? 1 : 0);
  return total ? done / total : 0;
}

export function isComplete(d: Draft): boolean {
  return progress(d) >= 1;
}

/**
 * After logging set `setIdx` of exercise `exIdx`: who's next in a superset, or how long to rest.
 * In a superset the rest comes after the last member of the round.
 */
export function afterSet(d: Draft, exIdx: number, setIdx: number): { kind: 'partner'; label: string } | { kind: 'rest'; sec: number } {
  const e = d.exercises[exIdx].prescription;
  if (e.group) {
    const members = d.exercises.map((x, i) => ({ x, i })).filter(({ x }) => x.prescription.group === e.group);
    const pos = members.findIndex((m) => m.i === exIdx);
    for (const m of members.slice(pos + 1)) {
      const s = m.x.sets[setIdx];
      if (s && !s.done) return { kind: 'partner', label: m.x.prescription.label };
    }
  }
  return { kind: 'rest', sec: e.restSec };
}

/** Convert the draft into a SessionLog. Only completed sets are recorded. */
export function draftToSessionLog(d: Draft, id: string, now?: number): SessionLog {
  const p = d.prescription;
  const exercises = d.exercises
    .map((e) => ({
      slotKey: e.prescription.slotKey,
      movementId: e.prescription.movementId,
      scheme: e.prescription.scheme,
      repRange: e.prescription.sets[0]?.repRange,
      sets: e.sets
        .filter((s) => s.done)
        .map(
          (s): LoggedSet => ({
            kind: s.prescribed.kind === 'calibration' && e.sets.indexOf(s) > 0 ? 'working' : s.prescribed.kind,
            loadKg: s.loadKg,
            reps: s.reps,
            rir: s.rir,
            targetReps: s.prescribed.reps,
            targetRir: s.prescribed.targetRir,
            ...(s.techniquePoor ? { techniquePoor: true } : {}),
          }),
        ),
    }))
    .filter((e) => e.sets.length > 0);

  const c = p.conditioning;
  const conditioning =
    c && d.conditioning?.done
      ? {
          wodId: c.id,
          name: c.name,
          format: c.format,
          scoreType: c.scoreType,
          benchmark: c.benchmark,
          score: d.conditioning.score,
          targetSplit: targetSplitOf(c.intervals?.target),
          hr: d.conditioning.hr,
        }
      : undefined;

  return {
    id,
    date: d.date,
    sessionNumber: p.sessionNumber,
    dayTypeId: p.dayTypeId,
    phase: p.phase,
    deload: p.phase === 'deload',
    partial: !isComplete(d),
    exercises,
    conditioning,
    notes: d.notes.trim() || undefined,
    ...(now != null ? { durationMin: elapsedMin(d, now) } : {}),
  };
}

/** "1:37/500m or faster" → 97; "21+ cal per round" → 21. */
export function targetSplitOf(target?: string): number | undefined {
  if (!target) return undefined;
  const pace = target.match(/(\d+):(\d{2})\/500m/);
  if (pace) return Number(pace[1]) * 60 + Number(pace[2]);
  const cal = target.match(/(\d+)\+? cal/);
  return cal ? Number(cal[1]) : undefined;
}

export function elapsedMin(d: Draft, now: number): number {
  return Math.max(0, Math.round((now - d.startedAt) / 60000));
}

/**
 * Where the lifter goes next after logging (exIdx, setIdx): the superset partner's same set,
 * then back to the first member for the next round, else the next set of this exercise,
 * else the first open set anywhere.
 */
export function nextFocus(d: Draft, exIdx: number, setIdx: number): { exIdx: number; setIdx: number } | undefined {
  const open = (i: number, j: number) => d.exercises[i]?.sets[j] && !d.exercises[i].sets[j].done;
  const e = d.exercises[exIdx].prescription;
  if (e.group) {
    const members = d.exercises.map((x, i) => ({ x, i })).filter(({ x }) => x.prescription.group === e.group).map(({ i }) => i);
    const pos = members.indexOf(exIdx);
    for (const i of members.slice(pos + 1)) if (open(i, setIdx)) return { exIdx: i, setIdx };
    for (const i of members) {
      const j = d.exercises[i].sets.findIndex((s) => !s.done);
      if (j >= 0) return { exIdx: i, setIdx: j };
    }
  } else {
    const j = d.exercises[exIdx].sets.findIndex((s) => !s.done);
    if (j >= 0) return { exIdx, setIdx: j };
  }
  return nextOpenSet(d);
}
