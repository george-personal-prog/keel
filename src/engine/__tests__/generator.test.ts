import { describe, expect, it } from 'vitest';
import { prescribeNextSession } from '../generate';
import { barKgFor } from '../loading';
import { getMovement } from '../movements/library';
import { blockInfo, weeksOut } from '../periodisation';
import { completeSession, createInitialState } from '../state';
import { splitFor } from '../templates';
import { prescribedSetsByMuscle, plannedWeek } from '../volume';
import type { Track } from '../types';
import { ALL_TRACKS, athlete, calibratedState, input, settings, simulate } from './helpers';

describe('determinism', () => {
  it('same input → identical prescription', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 12, athlete());
    const i = input(r.state, r.history, r.date);
    expect(prescribeNextSession(i)).toEqual(prescribeNextSession(structuredClone(i)));
  });

  it('does not mutate its input', () => {
    const r = simulate({ focus: 'competition', frequency: 5 }, 10, athlete());
    const i = input(r.state, r.history, r.date);
    const before = JSON.stringify(i);
    prescribeNextSession(i);
    expect(JSON.stringify(i)).toBe(before);
  });
});

describe('calibration week', () => {
  it('first pass through the split calibrates, then the block starts', () => {
    const track: Track = { focus: 'off-season', frequency: 4 };
    const r = simulate(track, 4, athlete());
    expect(r.prescriptions.every((p) => p.phase === 'calibration')).toBe(true);
    expect(r.prescriptions[0].flags.some((f) => f.kind === 'calibration')).toBe(true);
    expect(r.prescriptions[0].exercises[0].calibrating).toBe(true);
    expect(r.prescriptions[0].conditioning?.id).toBe('test:row-2k');
    expect(r.state.calibrated).toBe(true);
    const next = prescribeNextSession(input(r.state, r.history, r.date));
    expect(next.phase).toBe('hypertrophy');
    expect(next.exercises[0].calibrating).toBe(false);
    expect(next.exercises[0].sets[0].loadKg).toBeGreaterThan(0);
  });

  it('calibration sessions fit the time budget', () => {
    for (const track of ALL_TRACKS) {
      const r = simulate(track, track.frequency, athlete());
      for (const p of r.prescriptions) expect(p.estimatedMin, `${track.focus}${track.frequency} ${p.title}`).toBeLessThanOrEqual(60);
    }
  });
});

describe('every track generates sound sessions for 20 weeks', () => {
  it.each(ALL_TRACKS)('%o', (track) => {
    const r = simulate(track, track.frequency * 20 + track.frequency, athlete());
    for (const p of r.prescriptions) {
      const tag = `#${p.sessionNumber} ${p.title}`;
      expect(p.estimatedMin, tag).toBeLessThanOrEqual(60);
      expect(p.exercises.length, tag).toBeGreaterThan(0);
      expect(p.exercises.some((e) => e.priority === 1) || p.conditioning !== undefined, tag).toBe(true);
      expect(p.warmup.minutes, tag).toBeLessThanOrEqual(8);
      for (const e of p.exercises) {
        expect(e.why.length, tag).toBeGreaterThan(5);
        expect(e.sets.length, `${tag} ${e.movementName}`).toBeGreaterThan(0);
        const m = getMovement(e.movementId);
        for (const s of e.sets) {
          expect(Number.isFinite(s.reps) && s.reps > 0, tag).toBe(true);
          expect(s.targetRir).toBeGreaterThanOrEqual(0);
          expect(s.targetRir).toBeLessThanOrEqual(4);
          if (s.loadKg != null) {
            expect(Number.isFinite(s.loadKg), tag).toBe(true);
            if (m.loadType === 'barbell') {
              const bar = barKgFor(m, settings.equipment);
              expect(Math.abs(((s.loadKg - bar) / 2.5) % 1), `${tag} ${e.movementName} ${s.loadKg}`).toBeLessThan(1e-9);
            }
            if (m.loadType === 'dumbbell') expect(s.loadKg % settings.equipment.dumbbellStepKg).toBe(0);
          }
        }
      }
      if (p.conditioning) {
        expect(p.conditioning.why.length).toBeGreaterThan(5);
        expect(p.conditioning.durationMin).toBeGreaterThan(0);
      }
    }
  });
});

describe('progress over time', () => {
  it('an athlete who gets stronger sees their main lifts climb', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 24, athlete({ gainPerSession: 0.004 }));
    const squats = r.prescriptions.flatMap((p) => p.exercises.filter((e) => e.movementId === 'back-squat').map((e) => e.sets[0].loadKg!)).filter(Boolean);
    expect(squats.length).toBeGreaterThanOrEqual(5);
    expect(squats.at(-1)!).toBeGreaterThan(squats[0] * 1.05);
  });

  it('an athlete who stops improving does not get runaway loads', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 24, athlete({ gainPerSession: 0 }));
    const squats = r.prescriptions.flatMap((p) => p.exercises.filter((e) => e.movementId === 'back-squat' && e.sets[0].kind === 'top').map((e) => e.sets[0].loadKg!));
    // Never beyond what the athlete can actually do for 6 (true 6RM).
    expect(Math.max(...squats)).toBeLessThanOrEqual(160 / (1 + 6 / 30));
  });
});

describe('periodisation', () => {
  it('off-season blocks last 6 session-weeks', () => {
    const track: Track = { focus: 'off-season', frequency: 3 };
    const r = simulate(track, 3 + 18, athlete());
    const weeks = r.prescriptions.slice(3).map((p) => `${p.blockNumber}.${p.weekInBlock}`);
    expect(weeks.slice(0, 3)).toEqual(['1.1', '1.1', '1.1']);
    expect(weeks.slice(15, 18)).toEqual(['1.6', '1.6', '1.6']);
    expect(r.state.blockNumber).toBe(2);
  });

  it('competition date → accumulation / intensification / peak / taper counted back from the date', () => {
    const state = calibratedState({ focus: 'competition', frequency: 4, competitionDate: '2026-06-06' });
    const at = (today: string) => blockInfo(state, today);
    expect(at('2026-06-03').phase).toBe('taper');
    expect(at('2026-05-28').phase).toBe('peak');
    expect(at('2026-05-14')).toMatchObject({ phase: 'peak', weekInBlock: 1 });
    expect(at('2026-05-07')).toMatchObject({ phase: 'intensification', weekInBlock: 4 });
    expect(at('2026-04-16')).toMatchObject({ phase: 'intensification', weekInBlock: 1 });
    expect(at('2026-03-01').phase).toBe('accumulation');
    expect(weeksOut('2026-06-06', '2026-06-06')).toBe(1);
  });

  it('no date (or a passed date) → rolling accumulation/intensification blocks', () => {
    const s1 = calibratedState({ focus: 'competition', frequency: 4 });
    expect(blockInfo(s1, '2026-01-01').phase).toBe('accumulation');
    expect(blockInfo({ ...s1, blockNumber: 2 }, '2026-01-01').phase).toBe('intensification');
    const passed = calibratedState({ focus: 'competition', frequency: 4, competitionDate: '2025-12-01' });
    expect(blockInfo(passed, '2026-01-01').phase).toBe('accumulation');
    expect(blockInfo(passed, '2026-01-01').note).toMatch(/passed/);
  });

  it('peak week prescribes heavy singles/doubles and taper cuts volume', () => {
    const track: Track = { focus: 'competition', frequency: 4, competitionDate: '2026-04-25' };
    const r = simulate(track, 4 * 16, athlete(), { date: '2026-01-05' });
    const peak = r.prescriptions.filter((p) => p.phase === 'peak');
    const taper = r.prescriptions.filter((p) => p.phase === 'taper');
    expect(peak.length).toBeGreaterThan(0);
    expect(taper.length).toBeGreaterThan(0);
    const peakTop = peak.flatMap((p) => p.exercises.filter((e) => e.scheme === 'strength' && e.role === 'primary').map((e) => e.sets[0].reps));
    expect(Math.max(...peakTop)).toBeLessThanOrEqual(2);
    for (const p of taper) {
      for (const e of p.exercises.filter((x) => x.scheme === 'strength')) expect(e.sets.length).toBeLessThanOrEqual(2);
      expect(p.flags.some((f) => f.kind === 'taper')).toBe(true);
    }
  });
});

describe('time budget & short-on-time', () => {
  it('short-on-time keeps the priority work and says what was cut', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 8, athlete());
    const full = prescribeNextSession(input(r.state, r.history, r.date));
    const short = prescribeNextSession(input(r.state, r.history, r.date, { availableMin: 30 }));
    expect(short.estimatedMin).toBeLessThanOrEqual(30);
    expect(short.exercises.length).toBeLessThan(full.exercises.length);
    expect(short.exercises[0].movementId).toBe(full.exercises[0].movementId);
    const flag = short.flags.find((f) => f.kind === 'short-on-time');
    expect(flag?.message).toMatch(/Short on time \(30 min\)/);
  });

  it('respects a custom session budget', () => {
    const r = simulate({ focus: 'off-season', frequency: 6 }, 12, athlete());
    const p = prescribeNextSession({ ...input(r.state, r.history, r.date), settings: { ...settings, sessionBudgetMin: 45 } });
    expect(p.estimatedMin).toBeLessThanOrEqual(45);
  });
});

describe('warm-up', () => {
  it('ramp sets climb toward, but stay below, the first working load', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4, athlete());
    const p = prescribeNextSession(input(r.state, r.history, r.date));
    const ramp = p.warmup.rampSets!;
    expect(ramp.length).toBeGreaterThanOrEqual(3);
    const loads = ramp.map((s) => s.loadKg!);
    expect([...loads].sort((a, b) => a - b)).toEqual(loads);
    expect(Math.max(...loads)).toBeLessThan(p.exercises[0].sets[0].loadKg!);
    expect(loads[0]).toBe(20);
  });

  it('general warm-up when configured', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4, athlete());
    const p = prescribeNextSession({ ...input(r.state, r.history, r.date), settings: { ...settings, warmupStyle: 'general' } });
    expect(p.warmup.style).toBe('general');
    expect(p.warmup.minutes).toBeLessThanOrEqual(5);
  });
});

describe('weak-point bias', () => {
  const sum = (o: Record<string, number | undefined>, keys: string[]) => keys.reduce((a, k) => a + (o[k] ?? 0), 0);
  /** A representative week: after calibration, with real history, so budget trimming is realistic. */
  const week = (track: Track, blockNumber?: number) => {
    const r = simulate(track, track.frequency, athlete());
    const state = blockNumber ? { ...r.state, blockNumber } : r.state;
    return prescribedSetsByMuscle(plannedWeek(settings, state, r.date, r.history)) as Record<string, number>;
  };

  it.each([3, 4, 5, 6] as const)('off-season ×%i: side/rear delts, upper chest and lats out-volume other upper muscles', (frequency) => {
    const v = week({ focus: 'off-season', frequency });
    expect(v['delts-side']).toBeGreaterThanOrEqual(v.chest ?? 0);
    expect(v['delts-side']).toBeGreaterThanOrEqual(v.biceps ?? 0);
    expect(v['delts-side']).toBeGreaterThanOrEqual(frequency >= 4 ? 10 : 9); // block 1 = shoulder spotlight
    expect(v['delts-rear']).toBeGreaterThanOrEqual(frequency >= 4 ? 9 : 6);
    expect(v.lats).toBeGreaterThanOrEqual(9);
    expect(v['chest-upper']).toBeGreaterThan(v.chest ?? 0);
    expect(v.lats).toBeGreaterThanOrEqual(v['upper-back'] ?? 0);
    expect(sum(v, ['delts-side', 'delts-rear', 'chest-upper', 'lats'])).toBeGreaterThan(sum(v, ['chest', 'biceps', 'triceps', 'upper-back']));
  });

  it('competition still trains the weak points, just less', () => {
    const off = week({ focus: 'off-season', frequency: 4 });
    const comp = week({ focus: 'competition', frequency: 4 });
    expect(comp['delts-side']).toBeGreaterThanOrEqual(5);
    expect(comp.lats).toBeGreaterThanOrEqual(6);
    expect(comp['delts-side']).toBeLessThan(off['delts-side']);
  });

  it('the block spotlight rotates shoulders → upper chest → lats and adds volume to it', () => {
    const base = calibratedState({ focus: 'off-season', frequency: 4 });
    const spot = (blockNumber: number) => prescribeNextSession(input({ ...base, blockNumber }, { sessions: [], skips: [] })).spotlight;
    expect([1, 2, 3, 4].map(spot)).toEqual(['shoulders', 'upper-chest', 'lats', 'shoulders']);
    const vol = (blockNumber: number) => week({ focus: 'off-season', frequency: 4 }, blockNumber);
    expect(vol(3).lats).toBeGreaterThan(vol(1).lats);
    expect(vol(1)['delts-side']).toBeGreaterThan(vol(2)['delts-side']);
  });
});

describe('accessory rotation', () => {
  it('core lifts stay; accessories rotate at block boundaries', () => {
    const track: Track = { focus: 'off-season', frequency: 4 };
    const s1 = calibratedState(track);
    const s2 = { ...s1, blockNumber: 2 };
    const h = { sessions: [], skips: [] };
    const a = prescribeNextSession(input(s1, h));
    const b = prescribeNextSession(input(s2, h));
    expect(b.exercises[0].movementId).toBe(a.exercises[0].movementId);
    const changed = a.exercises.filter((e, i) => b.exercises[i] && b.exercises[i].movementId !== e.movementId);
    expect(changed.length).toBeGreaterThanOrEqual(2);
  });

  it('within a block the same day gets the same exercises every week', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 12, athlete());
    const day0 = r.prescriptions.slice(4).filter((p) => p.dayTypeId === 'off-upper-press');
    const ids = day0.map((p) => p.exercises.map((e) => e.movementId).filter((id) => id !== 'cable-upright-row').join(','));
    expect(new Set(ids).size).toBe(1);
  });
});

describe('supersets & labels', () => {
  it('labels sequentially and groups supersets', () => {
    const p = prescribeNextSession(input(calibratedState({ focus: 'off-season', frequency: 4 }), { sessions: [], skips: [] }));
    expect(p.exercises.map((e) => e.label).slice(0, 5)).toEqual(['A', 'B1', 'B2', 'C1', 'C2']);
    expect(p.exercises[1].group).toBe('B');
    expect(p.exercises[0].group).toBeUndefined();
  });

  it('every split has a defined day for every frequency', () => {
    for (const t of ALL_TRACKS) expect(splitFor(t.focus, t.frequency)).toHaveLength(t.frequency);
  });
});

describe('session numbering', () => {
  it('sessionNumber is completed + 1', () => {
    let state = createInitialState({ focus: 'off-season', frequency: 3 });
    const h = { sessions: [], skips: [] };
    const p1 = prescribeNextSession(input(state, h));
    expect(p1.sessionNumber).toBe(1);
    state = completeSession(state, p1, '2026-01-05');
    expect(prescribeNextSession(input(state, h)).sessionNumber).toBe(2);
  });
});
