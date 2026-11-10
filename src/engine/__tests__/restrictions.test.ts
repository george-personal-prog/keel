import { describe, expect, it } from 'vitest';
import { ALL_BENCHMARK_DEFS, BENCHMARKS } from '../conditioning';
import { getMovement, hasMovement, MOVEMENTS, RAW_MOVEMENTS, swapOptions } from '../movements/library';
import { checkRestriction, MAX_PRESS_ANGLE_DEG } from '../movements/restrictions';
import { swapExercise } from '../state';
import { DAY_TEMPLATES } from '../templates';
import { ALL_TRACKS, athlete, calibratedState, simulate } from './helpers';

const BANNED_IDS = [
  'strict-press',
  'push-press',
  'seated-db-shoulder-press',
  'standing-db-shoulder-press',
  'machine-shoulder-press',
  'arnold-press',
  'z-press',
  'behind-neck-press',
  'kb-strict-press',
  'steep-incline-press',
  'handstand-push-up',
  'strict-hspu',
  'handstand-walk',
  'wall-walk',
  'pike-push-up',
];

const MUST_ALLOW = [
  'snatch', 'clean-and-jerk', 'split-jerk', 'push-jerk', 'thruster', 'wall-ball', 'overhead-squat',
  'db-snatch', 'kb-snatch', 'pull-up', 'toes-to-bar', 'bar-muscle-up', 'ring-muscle-up', 'ring-dip',
  'bar-dip', 'incline-db-press', 'high-incline-db-press', 'landmine-press', 'db-lateral-raise',
  'cable-lateral-raise', 'machine-lateral-raise', 'cable-y-raise', 'lu-raise', 'cable-upright-row',
];

describe('hard overhead-pressing restriction', () => {
  it('every banned movement is defined in the raw library and rejected by the filter', () => {
    for (const id of BANNED_IDS) {
      const raw = RAW_MOVEMENTS.find((m) => m.id === id);
      expect(raw, id).toBeDefined();
      expect(checkRestriction(raw!).banned, id).toBe(true);
      expect(hasMovement(id), id).toBe(false);
      expect(() => getMovement(id)).toThrow();
    }
  });

  it('allows Olympic lifts, ballistic overhead work, bar/ring work, inclines ≤ 60° and lateral raises', () => {
    for (const id of MUST_ALLOW) expect(hasMovement(id), id).toBe(true);
  });

  it('no allowed movement presses steeper than the limit or is inverted', () => {
    for (const m of MOVEMENTS) {
      expect(m.inverted, m.id).toBeFalsy();
      expect(m.pattern).not.toBe('vertical-press');
      if (m.overhead?.kind === 'press') expect(m.overhead.pressAngleDeg, m.id).toBeLessThanOrEqual(MAX_PRESS_ANGLE_DEG);
    }
  });

  it('the rule is attribute-based: a new steep press is caught without being named', () => {
    const sneaky = { ...getMovement('incline-db-press'), id: 'new-thing', overhead: { kind: 'press' as const, pressAngleDeg: 80 } };
    expect(checkRestriction(sneaky).banned).toBe(true);
    const handstandThing = { ...getMovement('push-up'), id: 'new-hs', inverted: true };
    expect(checkRestriction(handstandThing).banned).toBe(true);
  });

  it('swap options never include banned movements, for every movement', () => {
    for (const m of MOVEMENTS) {
      for (const o of swapOptions(m.id)) {
        expect(hasMovement(o)).toBe(true);
        expect(BANNED_IDS).not.toContain(o);
      }
    }
  });

  it('swapping to a banned movement is rejected', () => {
    const state = calibratedState({ focus: 'off-season', frequency: 4 });
    expect(() => swapExercise(state, 'a', 'strict-press')).toThrow();
    expect(() => swapExercise(state, 'a', 'machine-shoulder-press')).toThrow();
  });

  it('templates only reference allowed movements', () => {
    for (const day of Object.values(DAY_TEMPLATES)) {
      for (const slot of day.slots) for (const c of slot.candidates) expect(hasMovement(c), `${day.id}:${c}`).toBe(true);
    }
  });

  it('benchmarks containing banned or unavailable movements are excluded (Diane, Mary, FGB, Helen)', () => {
    const names = BENCHMARKS.map((b) => b.name);
    for (const n of ['Diane', 'Mary', 'Fight Gone Bad', 'Helen']) expect(names).not.toContain(n);
    for (const n of ['Fran', 'Grace', 'Isabel', 'DT', 'Karen']) expect(names).toContain(n);
    expect(ALL_BENCHMARK_DEFS.length).toBeGreaterThan(BENCHMARKS.length);
    for (const b of BENCHMARKS) for (const c of b.components) expect(hasMovement(c.movementId)).toBe(true);
  });

  it.each(ALL_TRACKS)('nothing programmed over 16 weeks is banned: %o', (track) => {
    const r = simulate(track, track.frequency * 16, athlete());
    for (const p of r.prescriptions) {
      for (const e of p.exercises) {
        expect(hasMovement(e.movementId), e.movementId).toBe(true);
        for (const o of e.swapOptions) expect(hasMovement(o)).toBe(true);
      }
      for (const c of p.conditioning?.components ?? []) expect(hasMovement(c.movementId), c.movementId).toBe(true);
    }
  });
});

describe('movement library integrity', () => {
  it('ids are unique', () => {
    const ids = RAW_MOVEMENTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('anchors point at allowed movements with sane ratios', () => {
    for (const m of MOVEMENTS) {
      if (!m.anchor) continue;
      expect(hasMovement(m.anchor.movementId), m.id).toBe(true);
      expect(m.anchor.ratio).toBeGreaterThan(0.2);
      expect(m.anchor.ratio).toBeLessThan(1.2);
    }
  });

  it('weak-point muscles are well served by the library', () => {
    const count = (muscle: string) => MOVEMENTS.filter((m) => (m.muscles as Record<string, number>)[muscle] === 1).length;
    expect(count('delts-side')).toBeGreaterThanOrEqual(6);
    expect(count('delts-rear')).toBeGreaterThanOrEqual(4);
    expect(count('chest-upper')).toBeGreaterThanOrEqual(7);
    expect(count('lats')).toBeGreaterThanOrEqual(12);
  });

  it('swaps stay within the movement pattern family', () => {
    expect(swapOptions('db-lateral-raise').every((id) => getMovement(id).pattern === 'lateral-delt')).toBe(true);
    expect(swapOptions('back-squat')).toContain('front-squat');
    expect(swapOptions('back-squat')).not.toContain('deadlift');
    // Olympic lifts swap only among Olympic variants
    expect(swapOptions('snatch').every((id) => getMovement(id).tags.includes('olympic'))).toBe(true);
  });
});
