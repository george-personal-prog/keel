import { describe, expect, it } from 'vitest';
import { assessDeload } from '../deload';
import { prescribeNextSession } from '../generate';
import { assessReadiness, rampFactor, rampFor } from '../readiness';
import { changeTrack, completeSession, createInitialState, declineDeload, migrateState, swapExercise } from '../state';
import type { History, SessionLog, Track } from '../types';
import { addDays } from '../util';
import { athlete, calibratedState, ex, input, log, perform, simulate } from './helpers';

const OFF4: Track = { focus: 'off-season', frequency: 4 };

describe('sequence-based queue', () => {
  it('skips never advance or lose the queue', () => {
    const r = simulate(OFF4, 6, athlete());
    const before = prescribeNextSession(input(r.state, r.history, r.date));
    const history: History = {
      ...r.history,
      skips: [
        { date: r.date, reason: 'busy' },
        { date: addDays(r.date, 1), reason: 'motivation' },
      ],
    };
    const after = prescribeNextSession(input(r.state, history, addDays(r.date, 2)));
    expect(after.dayTypeId).toBe(before.dayTypeId);
    expect(after.sessionNumber).toBe(before.sessionNumber);
    expect(after.exercises.map((e) => e.movementId)).toEqual(before.exercises.map((e) => e.movementId));
  });

  it('completing advances through the split in order and wraps', () => {
    let state = calibratedState(OFF4);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = prescribeNextSession(input(state, { sessions: [], skips: [] }));
      seen.push(p.dayTypeId);
      state = completeSession(state, p, '2026-01-05');
    }
    expect(seen).toEqual(['off-upper-press', 'off-lower-squat', 'off-upper-pull', 'off-lower-hinge', 'off-upper-press', 'off-lower-squat']);
  });

  it('a slow week stretches the block instead of compressing it', () => {
    // 8 sessions over 4 calendar weeks at 4×/week = only 2 session-weeks of the block
    const r = simulate(OFF4, 4, athlete());
    let { state } = r;
    const history = r.history;
    let date = r.date;
    for (let i = 0; i < 8; i++) {
      const p = prescribeNextSession(input(state, history, date));
      history.sessions.push(perform(athlete(), p, date));
      state = completeSession(state, p, date);
      date = addDays(date, 3);
    }
    expect(prescribeNextSession(input(state, history, date)).weekInBlock).toBe(3);
  });
});

describe('track switching', () => {
  it("'now' switches split immediately and keeps e1RMs (no recalibration)", () => {
    const r = simulate(OFF4, 4 + 4, athlete());
    const switched = changeTrack(r.state, { focus: 'competition', frequency: 4 }, 'now');
    expect(switched.cursor).toBe(0);
    expect(switched.calibrated).toBe(true);
    const p = prescribeNextSession(input(switched, r.history, r.date));
    expect(p.dayTypeId).toBe('comp-snatch-squat');
    const squat = p.exercises.find((e) => e.movementId === 'back-squat')!;
    expect(squat.calibrating).toBe(false);
    expect(squat.sets[0].loadKg).toBeGreaterThan(100);
  });

  it("'next-block' queues the change and applies it at the block boundary", () => {
    const track: Track = { focus: 'off-season', frequency: 3 };
    const r = simulate(track, 3 + 3, athlete());
    let state = changeTrack(r.state, { focus: 'off-season', frequency: 5 }, 'next-block');
    expect(state.track.frequency).toBe(3);
    expect(prescribeNextSession(input(state, r.history, r.date)).flags.some((f) => f.kind === 'track-change')).toBe(true);
    const history = r.history;
    let date = r.date;
    for (let i = 0; i < 15; i++) {
      const p = prescribeNextSession(input(state, history, date));
      history.sessions.push(perform(athlete(), p, date));
      state = completeSession(state, p, date);
      date = addDays(date, 2);
    }
    expect(state.track.frequency).toBe(5);
    expect(state.pendingTrack).toBeUndefined();
    expect(state.blockNumber).toBe(2);
  });

  it('changing only the competition date keeps position', () => {
    const s = calibratedState({ focus: 'competition', frequency: 4 }, { cursor: 2 });
    const t = changeTrack(s, { focus: 'competition', frequency: 4, competitionDate: '2026-09-01' }, 'now');
    expect(t.cursor).toBe(2);
    expect(t.track.competitionDate).toBe('2026-09-01');
  });

  it('rejects invalid tracks', () => {
    expect(() => createInitialState({ focus: 'off-season', frequency: 7 as never })).toThrow();
    expect(() => changeTrack(calibratedState(OFF4), { focus: 'off-season', frequency: 4, competitionDate: '1/2/26' }, 'now')).toThrow();
  });
});

describe('exercise swaps', () => {
  it('swaps persist for the block, link history by movement, and clear at rollover', () => {
    const r = simulate(OFF4, 4, athlete());
    const p = prescribeNextSession(input(r.state, r.history, r.date));
    const lateral = p.exercises.find((e) => e.pattern === 'lateral-delt')!;
    const alt = lateral.swapOptions.find((o) => o !== lateral.movementId)!;
    const swapped = swapExercise(r.state, lateral.slotId, alt);
    const p2 = prescribeNextSession(input(swapped, r.history, r.date));
    expect(p2.exercises.find((e) => e.slotId === lateral.slotId)!.movementId).toBe(alt);
    // Rollover clears swaps
    const rolled = completeSession({ ...swapped, completedSessions: swapped.blockStartSession + 6 * 4 - 1 }, p2, r.date);
    expect(rolled.swaps).toEqual({});
  });

  it('only same-pattern swaps are accepted; swapping back removes the override', () => {
    const s = calibratedState(OFF4);
    expect(() => swapExercise(s, 'a', 'deadlift')).toThrow(/not an equivalent/);
    const swapped = swapExercise(s, 'a', 'incline-db-press');
    expect(Object.values(swapped.swaps)).toEqual(['incline-db-press']);
    expect(swapExercise(swapped, 'a', 'incline-bench-press').swaps).toEqual({});
  });
});

describe('skips, gaps and re-entry', () => {
  const base = (date: string): SessionLog => log(date, [ex('back-squat', [{ kind: 'top', loadKg: 140, reps: 6, rir: 3, targetReps: 6, targetRir: 3 }])]);

  it('ramp length and depth scale with time off', () => {
    expect(rampFor(5)).toBeUndefined();
    expect(rampFor(10)).toEqual({ sessions: 1, drop: 0.075 });
    expect(rampFor(20)!.sessions).toBe(2);
    expect(rampFor(35)!.sessions).toBe(3);
    expect(rampFor(70)!.sessions).toBe(4);
    const r = rampFor(35)!;
    expect([0, 1, 2].map((i) => rampFactor(r, i))).toEqual([0.82, 0.88, 0.94].map((x) => expect.closeTo(x, 5)));
  });

  it('a 10-day gap → one re-entry session at 92.5%', () => {
    const h: History = { sessions: [base('2026-01-01')], skips: [{ date: '2026-01-05', reason: 'away' }] };
    const r = assessReadiness(h, '2026-01-11');
    expect(r.mods.loadFactor).toBeCloseTo(0.925);
    expect(r.flags[0].message).toMatch(/Re-entry 1\/1 after 10 days \(time away\)/);
  });

  it('a 5-week gap ramps over 3 sessions with rising loads and +1 RIR', () => {
    const sessions = [base('2026-01-01')];
    const factors: number[] = [];
    let today = '2026-02-05';
    for (let i = 0; i < 4; i++) {
      const r = assessReadiness({ sessions, skips: [] }, today);
      factors.push(r.mods.loadFactor);
      if (i < 3) expect(r.mods.rirDelta).toBe(1);
      sessions.push(base(today));
      today = addDays(today, 2);
    }
    expect(factors[0]).toBeLessThan(factors[1]);
    expect(factors[1]).toBeLessThan(factors[2]);
    expect(factors[3]).toBe(1);
  });

  it('ill → lighter, fewer sets, easy conditioning, regardless of gap', () => {
    const h: History = { sessions: [base('2026-01-01')], skips: [{ date: '2026-01-03', reason: 'ill' }] };
    const r = assessReadiness(h, '2026-01-05');
    expect(r.mods.loadFactor).toBe(0.9);
    expect(r.mods.setDelta).toBe(-1);
    expect(r.mods.rirDelta).toBe(1);
    expect(r.easyConditioning).toBe(true);
    expect(r.flags.some((f) => f.kind === 'ill-return')).toBe(true);
  });

  it('ill skips change the actual prescription', () => {
    const sim = simulate(OFF4, 8, athlete());
    const normal = prescribeNextSession(input(sim.state, sim.history, sim.date));
    const ill = prescribeNextSession(input(sim.state, { ...sim.history, skips: [{ date: sim.date, reason: 'ill' }] }, addDays(sim.date, 2)));
    expect(ill.exercises[0].sets[0].loadKg!).toBeLessThan(normal.exercises[0].sets[0].loadKg!);
    expect(ill.conditioning?.why).toMatch(/easy aerobic/);
  });

  it('busy → no penalty, suggests short-on-time', () => {
    const h: History = { sessions: [base('2026-01-01')], skips: [{ date: '2026-01-03', reason: 'busy' }] };
    const r = assessReadiness(h, '2026-01-04');
    expect(r.mods.loadFactor).toBe(1);
    expect(r.flags.map((f) => f.kind)).toEqual(['short-on-time']);
  });

  it('one motivation skip does nothing; repeated ones trim volume and say why', () => {
    const one: History = { sessions: [base('2026-01-01')], skips: [{ date: '2026-01-03', reason: 'motivation' }] };
    expect(assessReadiness(one, '2026-01-04').mods.volumeFactor).toBe(1);
    const two: History = { ...one, skips: [{ date: '2025-12-20', reason: 'motivation' }, ...one.skips] };
    const r = assessReadiness(two, '2026-01-04');
    expect(r.mods.volumeFactor).toBe(0.8);
    expect(r.flags[0].message).toMatch(/2 low-motivation skips/);
  });
});

describe('deloads only when justified', () => {
  /** Build a history where some lifts regress (true strength falls) after a few good weeks. */
  function regressingHistory(lifts: string[], weeks = 6) {
    const a = athlete({ gainPerSession: 0.003 });
    const r = simulate(OFF4, 4 + weeks * 4, a);
    a.gainPerSession = 0;
    for (const id of lifts) a.trueE1rm[id] *= 0.85; // clearly weaker now
    let { state } = r;
    let date = r.date;
    for (let i = 0; i < 8; i++) {
      const p = prescribeNextSession(input(state, r.history, date, { ignoreDeload: true }));
      r.history.sessions.push(perform(a, p, date));
      state = completeSession(state, p, date);
      date = addDays(date, 2);
    }
    return { state, history: r.history, date };
  }

  it('steady progress → no deload, even after 8+ weeks (review prompt instead)', () => {
    const r = simulate(OFF4, 4 + 40, athlete({ gainPerSession: 0.003 }));
    expect(r.prescriptions.some((p) => p.phase === 'deload')).toBe(false);
    const a = assessDeload(r.history, r.state, r.date);
    expect(a.trigger).toBe(false);
    expect(a.reviewDue).toBe(true);
    expect(prescribeNextSession(input(r.state, r.history, r.date)).flags.some((f) => f.kind === 'deload-review')).toBe(true);
  });

  it('broad regression across main lifts → deload with evidence', () => {
    const { state, history, date } = regressingHistory(['back-squat', 'deadlift', 'incline-bench-press']);
    const a = assessDeload(history, state, date);
    expect(a.trigger).toBe(true);
    expect(a.evidence.filter((e) => e.kind === 'e1rm-regression').length).toBeGreaterThanOrEqual(2);
    const p = prescribeNextSession(input(state, history, date));
    expect(p.phase).toBe('deload');
    expect(p.deload!.evidence.length).toBeGreaterThan(0);
    expect(p.flags.find((f) => f.kind === 'deload')!.message).toMatch(/stalling or regressing/);
  });

  it('one lift wobbling does not trigger a deload', () => {
    const { state, history, date } = regressingHistory(['back-squat']);
    expect(assessDeload(history, state, date).trigger).toBe(false);
  });

  it('declining suppresses re-triggering for two weeks', () => {
    const { state, history, date } = regressingHistory(['back-squat', 'deadlift', 'incline-bench-press']);
    const declined = declineDeload(state, date);
    expect(assessDeload(history, declined, addDays(date, 3)).trigger).toBe(false);
    expect(prescribeNextSession(input(state, history, date, { ignoreDeload: true })).phase).not.toBe('deload');
  });

  it('a deload lasts one session-week, halves volume, then starts a fresh block', () => {
    const { state, history, date } = regressingHistory(['back-squat', 'deadlift', 'incline-bench-press']);
    let s = state;
    const normal = prescribeNextSession(input(s, history, date, { ignoreDeload: true }));
    const blockBefore = s.blockNumber;
    const phases: string[] = [];
    let d = date;
    for (let i = 0; i < 4; i++) {
      const p = prescribeNextSession(input(s, history, d));
      phases.push(p.phase);
      if (i === 0) {
        const nSets = (x: typeof p) => x.exercises.reduce((a, e) => a + e.sets.length, 0);
        expect(nSets(p)).toBeLessThan(nSets(normal) * 0.75);
        expect(p.conditioning?.why).toMatch(/Deload/);
      }
      history.sessions.push(perform(athlete(), p, d));
      s = completeSession(s, p, d);
      d = addDays(d, 2);
    }
    expect(phases).toEqual(['deload', 'deload', 'deload', 'deload']);
    expect(s.deload).toBeUndefined();
    expect(s.lastDeloadEndDate).toBe(addDays(date, 6));
    expect(s.blockNumber).toBe(blockBefore + 1);
    expect(prescribeNextSession(input(s, history, d)).phase).toBe('hypertrophy');
  });

  it('no deload within 3 weeks of the last one', () => {
    const { state, history, date } = regressingHistory(['back-squat', 'deadlift', 'incline-bench-press']);
    expect(assessDeload(history, { ...state, lastDeloadEndDate: addDays(date, -10) }, date).trigger).toBe(false);
  });

  it('missed targets plus a regression corroborate each other', () => {
    const sessions = [100, 102.5, 105, 107.5, 100, 97.5].map((load, i) =>
      log(addDays('2026-01-01', i * 7), [
        ex('back-squat', [{ kind: 'top', loadKg: load, reps: i >= 4 ? 4 : 6, rir: i >= 4 ? 0 : 2, targetReps: 6, targetRir: 2 }]),
        ex('deadlift', [{ kind: 'top', loadKg: 150, reps: i >= 4 ? 3 : 6, rir: 1, targetReps: 6, targetRir: 2 }]),
        ex('db-lateral-raise', [{ kind: 'working', loadKg: 12, reps: i >= 4 ? 9 : 14, rir: 1, targetReps: 14, targetRir: 2 }], { scheme: 'hypertrophy', repRange: [12, 20] }),
      ]),
    );
    const state = calibratedState(OFF4);
    const a = assessDeload({ sessions, skips: [] }, state, addDays('2026-01-01', 36));
    expect(a.evidence.some((e) => e.kind === 'missed-targets')).toBe(true);
    expect(a.trigger).toBe(true);
  });
});

describe('schema', () => {
  it('migrateState accepts v1 and rejects unknown versions', () => {
    const s = createInitialState(OFF4);
    expect(migrateState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(() => migrateState({ schemaVersion: 99 })).toThrow();
  });
});
