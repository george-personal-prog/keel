import { describe, expect, it } from 'vitest';
import { getMovement } from '../movements/library';
import {
  NO_MODS,
  olympicTrainingMax,
  prescribeHypertrophy,
  prescribeOlympic,
  prescribeStrength,
  type ProgressionContext,
} from '../progression';
import type { SlotTemplate } from '../templates';
import type { History, LoggedSet, Phase } from '../types';
import { emptyHistory, ex, log, settings } from './helpers';

function ctx(movementId: string, history: History, slot: Partial<SlotTemplate> = {}, phase: Phase = 'hypertrophy', week = 1): ProgressionContext {
  return {
    movement: getMovement(movementId),
    slot: { id: 'a', candidates: [movementId], role: 'primary', scheme: 'strength', priority: 1, ...slot },
    phase,
    weekInBlock: week,
    focus: 'off-season',
    history,
    settings,
    mods: NO_MODS,
  };
}

function hist(...sessions: { date: string; movementId: string; sets: Partial<LoggedSet>[]; repRange?: [number, number]; scheme?: 'strength' | 'hypertrophy' | 'olympic' }[]): History {
  return {
    sessions: sessions.map((s) => log(s.date, [ex(s.movementId, s.sets, { repRange: s.repRange, scheme: s.scheme ?? 'strength' })])),
    skips: [],
  };
}

// off-season primary strength week 1: top 6 @ RIR 3, 2 × 8 back-offs @ 85%
const top = (loadKg: number, reps: number, rir: number, targetReps = 6, targetRir = 3): Partial<LoggedSet> => ({ kind: 'top', loadKg, reps, rir, targetReps, targetRir });

describe('strength: top set + back-offs from rolling e1RM', () => {
  it('calibrates when there is no data at all', () => {
    const r = prescribeStrength(ctx('back-squat', emptyHistory()));
    expect(r.calibrating).toBe(true);
    expect(r.sets[0].loadKg).toBeNull();
    expect(r.sets[0].kind).toBe('calibration');
  });

  it('hit target → +one loadable step', () => {
    const r = prescribeStrength(ctx('back-squat', hist({ date: '2026-01-01', movementId: 'back-squat', sets: [top(120, 6, 3)] })));
    expect(r.sets[0]).toMatchObject({ kind: 'top', loadKg: 122.5, reps: 6, targetRir: 3 });
    expect(r.why).toMatch(/\+2\.5 kg/);
    // back-offs at 85% of the top set, rounded
    expect(r.sets.slice(1).map((s) => s.loadKg)).toEqual([105, 105]);
    expect(r.sets[0].platesPerSide).toEqual([25, 25, 1.25]);
  });

  it('easy set (RIR well above target) → bigger jump, capped at +10%', () => {
    // week 3: target 6 @ RIR 2; logged 6 @ RIR 4 (two easier than planned)
    const h = hist({ date: '2026-01-01', movementId: 'back-squat', sets: [top(120, 6, 4, 6, 2)] });
    const r = prescribeStrength(ctx('back-squat', h, {}, 'hypertrophy', 3));
    expect(r.sets[0].loadKg!).toBeGreaterThan(122.5);
    expect(r.sets[0].loadKg!).toBeLessThanOrEqual(132);
    expect(r.why).toMatch(/easier than planned/);
  });

  it('cap holds even for a wildly sandbagged set', () => {
    const h = hist(
      { date: '2026-01-01', movementId: 'back-squat', sets: [top(100, 6, 4)] },
      { date: '2026-01-08', movementId: 'back-squat', sets: [top(100, 6, 4)] },
    );
    const r = prescribeStrength(ctx('back-squat', h));
    expect(r.sets[0].loadKg!).toBeLessThanOrEqual(110);
  });

  it('missed one rep → hold', () => {
    const h = hist(
      { date: '2026-01-01', movementId: 'back-squat', sets: [top(120, 6, 3)] },
      { date: '2026-01-08', movementId: 'back-squat', sets: [top(122.5, 5, 0)] },
    );
    const r = prescribeStrength(ctx('back-squat', h));
    expect(r.sets[0].loadKg!).toBeLessThanOrEqual(122.5);
    expect(r.why).toMatch(/Missed a rep/);
  });

  it('missed two+ reps → reduce ~5%', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(122.5, 4, 0)] });
    const r = prescribeStrength(ctx('back-squat', h));
    expect(r.sets[0].loadKg!).toBeLessThanOrEqual(117.5);
    expect(r.why).toMatch(/reduce/);
  });

  it('reps made but much grindier than planned → hold, never increase', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(122.5, 6, 1)] });
    const r = prescribeStrength(ctx('back-squat', h));
    expect(r.sets[0].loadKg!).toBeLessThanOrEqual(122.5);
    expect(r.why).toMatch(/harder than planned/);
  });

  it('one RIR under target is treated as on target (rating noise), moving at most one step', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(122.5, 6, 2)] });
    const r = prescribeStrength(ctx('back-squat', h));
    expect(Math.abs(r.sets[0].loadKg! - 122.5)).toBeLessThanOrEqual(2.5);
  });

  it('new rep/RIR scheme converts the last top set rather than copying it', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(130, 5, 1, 5, 1)] });
    const r = prescribeStrength(ctx('back-squat', h, {}, 'hypertrophy', 1)); // 6 @ RIR 3 now
    expect(r.sets[0].loadKg!).toBeLessThan(130);
    expect(r.sets[0].reps).toBe(6);
  });

  it('estimates a never-done variation from its anchor (track switches need no recalibration)', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(140, 6, 3)] });
    const r = prescribeStrength(ctx('front-squat', h));
    expect(r.calibrating).toBe(false);
    expect(r.why).toMatch(/Back Squat e1RM × 0\.80/);
    // 140×6@3 → e1RM 182; FS ≈ 145.6; 6 @ RIR 3 → ~112
    expect(r.sets[0].loadKg).toBe(112.5);
  });

  it('applies re-entry load factors by rounding down', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(120, 6, 3)] });
    const r = prescribeStrength({ ...ctx('back-squat', h), mods: { ...NO_MODS, loadFactor: 0.9 } });
    expect(r.sets[0].loadKg!).toBeLessThanOrEqual(122.5 * 0.9);
    expect(r.why).toMatch(/re-entry/);
  });

  it('deload: straight sets at RIR 4', () => {
    const h = hist({ date: '2026-01-08', movementId: 'back-squat', sets: [top(120, 6, 3)] });
    const r = prescribeStrength(ctx('back-squat', h, {}, 'deload'));
    expect(r.sets).toHaveLength(3);
    expect(r.sets.every((s) => s.targetRir === 4 && s.loadKg! < 120)).toBe(true);
  });
});

describe('hypertrophy: double progression', () => {
  const hyp = { scheme: 'hypertrophy' as const, role: 'accessory' as const, priority: 3 };
  const w = (loadKg: number, reps: number, rir: number): Partial<LoggedSet> => ({ kind: 'working', loadKg, reps, rir, targetRir: 3 });

  it('topped the range at target RIR → +1 step, reps back to the bottom', () => {
    const h = hist({ date: '2026-01-01', movementId: 'db-lateral-raise', sets: [w(10, 20, 3), w(10, 20, 3), w(10, 20, 3)], repRange: [12, 20], scheme: 'hypertrophy' });
    const r = prescribeHypertrophy(ctx('db-lateral-raise', h, hyp));
    expect(r.sets[0].loadKg).toBe(12);
    expect(r.sets[0].reps).toBe(12);
    expect(r.sets[0].repRange).toEqual([12, 20]);
  });

  it('topped with RIR to spare → double jump', () => {
    const h = hist({ date: '2026-01-01', movementId: 'cable-lateral-raise', sets: [w(10, 20, 5), w(10, 20, 5)], repRange: [12, 20], scheme: 'hypertrophy' });
    const r = prescribeHypertrophy(ctx('cable-lateral-raise', h, hyp));
    expect(r.sets[0].loadKg).toBe(15);
    expect(r.why).toMatch(/double jump/);
  });

  it('inside the range → same load, +1 rep per set', () => {
    const h = hist({ date: '2026-01-01', movementId: 'db-lateral-raise', sets: [w(12, 15, 3), w(12, 14, 3), w(12, 13, 3)], repRange: [12, 20], scheme: 'hypertrophy' });
    const r = prescribeHypertrophy(ctx('db-lateral-raise', h, hyp));
    expect(r.sets.every((s) => s.loadKg === 12)).toBe(true);
    expect(r.sets.slice(0, 3).map((s) => s.reps)).toEqual([16, 15, 14]);
  });

  it('much harder than planned → repeat, no added reps', () => {
    const h = hist({ date: '2026-01-01', movementId: 'db-lateral-raise', sets: [w(12, 15, 1), w(12, 14, 0)], repRange: [12, 20], scheme: 'hypertrophy' });
    const r = prescribeHypertrophy(ctx('db-lateral-raise', h, hyp));
    expect(r.sets[0].reps).toBe(15);
    expect(r.why).toMatch(/repeat/);
  });

  it('fell below the bottom of the range → drop a step', () => {
    const h = hist({ date: '2026-01-01', movementId: 'incline-db-press', sets: [w(36, 6, 1), w(36, 5, 0)], repRange: [8, 12], scheme: 'hypertrophy' });
    const r = prescribeHypertrophy(ctx('incline-db-press', h, { ...hyp, role: 'secondary' }));
    expect(r.sets[0].loadKg).toBeLessThan(36);
  });

  it('bodyweight: progress reps; weighted bodyweight: add load at the top', () => {
    const h1 = hist({ date: '2026-01-01', movementId: 'ring-dip', sets: [{ ...w(0, 9, 3), loadKg: null }, { ...w(0, 8, 3), loadKg: null }], repRange: [6, 12], scheme: 'hypertrophy' });
    const r1 = prescribeHypertrophy(ctx('ring-dip', h1, hyp));
    expect(r1.sets[0].loadKg).toBeNull();
    expect(r1.sets[0].reps).toBe(10);

    const h2 = hist({ date: '2026-01-01', movementId: 'weighted-pull-up', sets: [w(0, 8, 3), w(0, 8, 3)], repRange: [5, 8], scheme: 'hypertrophy' });
    const r2 = prescribeHypertrophy(ctx('weighted-pull-up', h2, { ...hyp, repRange: [5, 8] }));
    expect(r2.sets[0].loadKg).toBe(2.5);
  });

  it('calibrates an unknown isolation; estimates a compound with an anchor', () => {
    const r = prescribeHypertrophy(ctx('reverse-pec-deck', emptyHistory(), hyp));
    expect(r.calibrating).toBe(true);
    expect(r.sets[0].loadKg).toBeNull();
    const h = hist({ date: '2026-01-01', movementId: 'bench-press', sets: [top(110, 5, 2, 5, 2)] });
    const r2 = prescribeHypertrophy(ctx('incline-db-press', h, { ...hyp, role: 'secondary' }));
    expect(r2.calibrating).toBe(false);
    expect(r2.sets[0].loadKg).toBeGreaterThan(20);
    expect(r2.sets[0].loadKg! % 2).toBe(0);
  });

  it('weak-point volume: spotlight adds a set, week 3+ ramps, capped at 4 per exercise', () => {
    const wp = { ...hyp, role: 'weak-point' as const, priority: 2, weakPoint: 'shoulders' as const };
    const h = emptyHistory();
    expect(prescribeHypertrophy(ctx('db-lateral-raise', h, wp, 'hypertrophy', 1)).sets).toHaveLength(3);
    expect(prescribeHypertrophy(ctx('db-lateral-raise', h, wp, 'hypertrophy', 3)).sets).toHaveLength(4);
    expect(prescribeHypertrophy({ ...ctx('db-lateral-raise', h, wp, 'hypertrophy', 1), spotlight: 'shoulders' }).sets).toHaveLength(4);
    expect(prescribeHypertrophy({ ...ctx('db-lateral-raise', h, wp, 'hypertrophy', 5), spotlight: 'shoulders' }).sets).toHaveLength(4);
  });

  it('RIR target falls across an off-season block and isolations go closer late on', () => {
    const h = emptyHistory();
    const rirAt = (week: number, id = 'db-lateral-raise') => prescribeHypertrophy(ctx(id, h, hyp, 'hypertrophy', week)).sets[0].targetRir;
    expect(rirAt(1)).toBe(3);
    expect(rirAt(3)).toBe(2);
    expect(rirAt(6)).toBe(0);
    expect(rirAt(6, 'incline-db-press')).toBe(1);
  });

  it('deload halves sets and holds load', () => {
    const h = hist({ date: '2026-01-01', movementId: 'db-lateral-raise', sets: [w(12, 15, 3), w(12, 14, 3), w(12, 13, 3)], repRange: [12, 20], scheme: 'hypertrophy' });
    const r = prescribeHypertrophy(ctx('db-lateral-raise', h, hyp, 'deload'));
    expect(r.sets).toHaveLength(2);
    expect(r.sets.every((s) => s.loadKg === 12 && s.targetRir === 4)).toBe(true);
  });
});

describe('olympic: % of training max, technique-gated', () => {
  const oly = { scheme: 'olympic' as const };
  const s = (loadKg: number, reps: number, extra: Partial<LoggedSet> = {}): Partial<LoggedSet> => ({ kind: 'working', loadKg, reps, rir: 2, targetReps: reps, ...extra });

  it('calibrates to a heavy single with no data', () => {
    const r = prescribeOlympic(ctx('snatch', emptyHistory(), oly, 'accumulation'));
    expect(r.calibrating).toBe(true);
  });

  it('prescribes % of TM by phase week', () => {
    const h = hist({ date: '2026-01-01', movementId: 'snatch', sets: [s(100, 1)], scheme: 'olympic' });
    const w1 = prescribeOlympic(ctx('snatch', h, oly, 'accumulation', 1));
    expect(w1.sets).toHaveLength(5);
    expect(w1.sets[0]).toMatchObject({ reps: 3, loadKg: 70 });
    const i3 = prescribeOlympic(ctx('snatch', h, oly, 'intensification', 3));
    expect(i3.sets[0]).toMatchObject({ reps: 2, loadKg: 85 });
  });

  it('TM grows only after clean sessions at ≥ 74% TM', () => {
    const base = hist({ date: '2026-01-01', movementId: 'snatch', sets: [s(100, 1)], scheme: 'olympic' });
    const clean = { ...base, sessions: [...base.sessions, ...hist({ date: '2026-01-08', movementId: 'snatch', sets: [s(80, 2), s(80, 2)], scheme: 'olympic' }).sessions] };
    expect(olympicTrainingMax(clean, 'snatch')!.tm).toBeCloseTo(101, 5);
    const light = { ...base, sessions: [...base.sessions, ...hist({ date: '2026-01-08', movementId: 'snatch', sets: [s(60, 3)], scheme: 'olympic' }).sessions] };
    expect(olympicTrainingMax(light, 'snatch')!.tm).toBe(100);
    const poor = { ...base, sessions: [...base.sessions, ...hist({ date: '2026-01-08', movementId: 'snatch', sets: [s(80, 2, { techniquePoor: true })], scheme: 'olympic' }).sessions] };
    expect(olympicTrainingMax(poor, 'snatch')!.tm).toBe(100);
  });

  it('a miss holds the load; misses twice in a row reset ~5%', () => {
    const one = hist(
      { date: '2026-01-01', movementId: 'snatch', sets: [s(100, 1)], scheme: 'olympic' },
      { date: '2026-01-08', movementId: 'snatch', sets: [s(72.5, 3), { ...s(72.5, 2), targetReps: 3 }], scheme: 'olympic' },
    );
    const r1 = prescribeOlympic(ctx('snatch', one, oly, 'accumulation', 3));
    expect(r1.sets[0].loadKg).toBeLessThanOrEqual(72.5);
    expect(r1.why).toMatch(/hold/);

    const two = { ...one, sessions: [...one.sessions, ...hist({ date: '2026-01-15', movementId: 'snatch', sets: [{ ...s(72.5, 2), targetReps: 3 }], scheme: 'olympic' }).sessions] };
    const r2 = prescribeOlympic(ctx('snatch', two, oly, 'accumulation', 4));
    expect(r2.sets[0].loadKg).toBeLessThanOrEqual(72.5 * 0.95);
    expect(r2.why).toMatch(/reset/);
  });

  it('a variation without history estimates its TM from the parent lift', () => {
    const h = hist({ date: '2026-01-01', movementId: 'snatch', sets: [s(100, 1)], scheme: 'olympic' });
    const r = prescribeOlympic(ctx('hang-snatch', h, oly, 'accumulation', 1));
    expect(r.calibrating).toBe(false);
    expect(r.why).toMatch(/Snatch × 0\.90/);
    expect(r.sets[0].loadKg).toBe(62.5);
  });
});
