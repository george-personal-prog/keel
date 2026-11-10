import { describe, expect, it } from 'vitest';
import { prescribeNextSession } from '../../engine';
import { simulate, athlete, input } from '../../engine/__tests__/helpers';
import {
  addSet,
  afterSet,
  createDraft,
  draftToSessionLog,
  isComplete,
  nextFocus,
  nextOpenSet,
  progress,
  setLoad,
  suggestedLoad,
  targetSplitOf,
  updateSet,
} from '../draft';

function draftFor(sessions = 8) {
  const r = simulate({ focus: 'off-season', frequency: 4 }, sessions, athlete());
  const p = prescribeNextSession(input(r.state, r.history, r.date));
  return createDraft(p, r.date, 1_000);
}

describe('draft session', () => {
  it('pre-fills every set with the prescription', () => {
    const d = draftFor();
    const s = d.exercises[0].sets[0];
    expect(s.loadKg).toBe(s.prescribed.loadKg);
    expect(s.reps).toBe(s.prescribed.reps);
    expect(s.rir).toBe(s.prescribed.targetRir);
    expect(progress(d)).toBe(0);
    expect(nextOpenSet(d)).toEqual({ exIdx: 0, setIdx: 0 });
  });

  it('one tap logs a set exactly as prescribed', () => {
    let d = draftFor();
    d = updateSet(d, 0, 0, { done: true });
    const log = draftToSessionLog(d, 'x');
    expect(log.exercises).toHaveLength(1);
    expect(log.exercises[0].sets[0]).toMatchObject({
      loadKg: d.exercises[0].sets[0].prescribed.loadKg,
      reps: d.exercises[0].sets[0].prescribed.reps,
      rir: d.exercises[0].sets[0].prescribed.targetRir,
      targetReps: d.exercises[0].sets[0].prescribed.reps,
    });
    expect(log.partial).toBe(true);
  });

  it('editing a load carries forward to the remaining undone sets of the same kind', () => {
    let d = draftFor();
    const ex = d.exercises.findIndex((e) => e.sets.length >= 3 && e.sets.every((s) => s.prescribed.kind === 'working'));
    d = updateSet(d, ex, 0, { done: true });
    d = setLoad(d, ex, 1, 99);
    expect(d.exercises[ex].sets.map((s) => s.loadKg).slice(1)).toEqual(d.exercises[ex].sets.slice(1).map(() => 99));
    expect(d.exercises[ex].sets[0].loadKg).not.toBe(99);
  });

  it('editing a top set does not change the back-offs', () => {
    let d = draftFor();
    const ex = d.exercises.findIndex((e) => e.sets[0].prescribed.kind === 'top');
    const backoff = d.exercises[ex].sets[1].loadKg;
    d = setLoad(d, ex, 0, 200);
    expect(d.exercises[ex].sets[1].loadKg).toBe(backoff);
  });

  it('suggests the last used load for calibration sets', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 0, athlete());
    const p = prescribeNextSession(input(r.state, r.history, r.date));
    let d = createDraft(p, r.date, 0);
    expect(d.exercises[0].sets[0].loadKg).toBeNull();
    expect(suggestedLoad(d.exercises[0], 0)).toBeNull();
    d = setLoad(d, 0, 0, 80, true, (x) => Math.round(x / 2.5) * 2.5);
    expect(d.exercises[0].sets.slice(1).map((s) => s.loadKg)).toEqual([72.5, 72.5]); // back-offs at ~90%
    d = updateSet(d, 0, 0, { done: true });
    expect(suggestedLoad(d.exercises[0], 1)).toBe(80);
  });

  it('supersets alternate partners before resting', () => {
    const d = draftFor();
    const b1 = d.exercises.findIndex((e) => e.prescription.label === 'B1');
    expect(afterSet(d, b1, 0)).toEqual({ kind: 'partner', label: 'B2' });
    const b2 = d.exercises.findIndex((e) => e.prescription.label === 'B2');
    expect(afterSet(d, b2, 0)).toMatchObject({ kind: 'rest' });
    expect(afterSet(d, 0, 0)).toEqual({ kind: 'rest', sec: d.exercises[0].prescription.restSec });
  });

  it('a complete draft becomes a full, non-partial session log', () => {
    let d = draftFor();
    d.exercises.forEach((e, i) => e.sets.forEach((_, j) => (d = updateSet(d, i, j, { done: true }))));
    if (d.conditioning) d = { ...d, conditioning: { ...d.conditioning, done: true, score: { timeSec: 300, rx: true } } };
    expect(isComplete(d)).toBe(true);
    const log = draftToSessionLog(d, 'id1');
    expect(log.partial).toBe(false);
    expect(log.exercises.length).toBe(d.exercises.length);
    expect(log.sessionNumber).toBe(d.prescription.sessionNumber);
    if (d.conditioning) expect(log.conditioning?.score.timeSec).toBe(300);
  });

  it('focus moves through a superset round, then back to the first member', () => {
    let d = draftFor();
    const b1 = d.exercises.findIndex((e) => e.prescription.label === 'B1');
    const b2 = d.exercises.findIndex((e) => e.prescription.label === 'B2');
    d = updateSet(d, b1, 0, { done: true });
    expect(nextFocus(d, b1, 0)).toEqual({ exIdx: b2, setIdx: 0 });
    d = updateSet(d, b2, 0, { done: true });
    expect(nextFocus(d, b2, 0)).toEqual({ exIdx: b1, setIdx: 1 });
  });

  it('extra sets can be added', () => {
    const d = addSet(draftFor(), 0);
    expect(d.exercises[0].sets.length).toBe(d.prescription.exercises[0].sets.length + 1);
  });

  it('parses interval targets', () => {
    expect(targetSplitOf('1:37/500m or faster')).toBe(97);
    expect(targetSplitOf('21+ cal per round')).toBe(21);
    expect(targetSplitOf(undefined)).toBeUndefined();
  });
});
