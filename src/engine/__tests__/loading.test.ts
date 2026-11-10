import { describe, expect, it } from 'vitest';
import { bestSetE1rm, e1rm, loadFor } from '../e1rm';
import { platesPerSide, roundLoad, smallestIncrement, stepLoad } from '../loading';
import { getMovement } from '../movements/library';
import { settings } from './helpers';

const eq = settings.equipment;
const squat = getMovement('back-squat');

describe('barbell rounding', () => {
  it('rounds to loadable totals in 2.5 kg steps above a 20 kg bar', () => {
    expect(roundLoad(101.2, squat, eq)).toBe(100);
    expect(roundLoad(101.3, squat, eq)).toBe(102.5);
    expect(roundLoad(137.4, squat, eq)).toBe(137.5);
    expect(roundLoad(3, squat, eq)).toBe(20);
  });

  it('every rounded load is a multiple of 2.5 kg', () => {
    for (let t = 20; t < 300; t += 0.37) {
      const r = roundLoad(t, squat, eq)!;
      expect(Math.abs((r - 20) / 2.5 - Math.round((r - 20) / 2.5))).toBeLessThan(1e-9);
      expect(Math.abs(r - t)).toBeLessThanOrEqual(1.25 + 1e-9);
    }
  });

  it('ties round down (conservative)', () => {
    expect(roundLoad(101.25, squat, eq)).toBe(100);
  });

  it('supports down/up modes', () => {
    expect(roundLoad(101.3, squat, eq, 'down')).toBe(100);
    expect(roundLoad(100.1, squat, eq, 'up')).toBe(102.5);
  });

  it('honours a per-lift bar weight', () => {
    const e = { ...eq, barKgByMovement: { 'back-squat': 15 } };
    expect(roundLoad(16, squat, e)).toBe(15);
    expect(roundLoad(18, squat, e)).toBe(17.5);
    expect(roundLoad(10, getMovement('ez-bar-curl'), eq)).toBe(10);
    expect(roundLoad(26, getMovement('safety-bar-squat'), eq)).toBe(25);
  });

  it('builds a plate breakdown with the fewest plates', () => {
    expect(platesPerSide(100, 20, eq.platesKg)).toEqual([25, 15]);
    expect(platesPerSide(142.5, 20, eq.platesKg)).toEqual([25, 25, 10, 1.25]);
    expect(platesPerSide(20, 20, eq.platesKg)).toEqual([]);
  });

  it('works with a reduced plate set (no 1.25s → 5 kg steps)', () => {
    const e = { ...eq, platesKg: [2.5, 5, 10, 20] };
    expect(roundLoad(102, squat, e)).toBe(100);
    expect(roundLoad(103, squat, e)).toBe(105);
    expect(smallestIncrement(100, squat, e)).toBe(5);
  });
});

describe('other implements', () => {
  it('dumbbells use the configured step', () => {
    const lat = getMovement('db-lateral-raise');
    expect(roundLoad(11, lat, eq)).toBe(10);
    expect(roundLoad(11.1, lat, eq)).toBe(12);
    expect(roundLoad(0.5, lat, eq)).toBe(2);
    expect(stepLoad(12, lat, eq, 1)).toBe(14);
    expect(roundLoad(11, lat, { ...eq, dumbbellStepKg: 2.5, dumbbellMinKg: 2.5 })).toBe(10);
  });

  it('cables use 2.5 kg steps, machines 5 kg, kettlebells the available bells', () => {
    expect(roundLoad(31, getMovement('cable-lateral-raise'), eq)).toBe(30);
    expect(roundLoad(73, getMovement('leg-extension'), eq)).toBe(75);
    expect(roundLoad(22, getMovement('kb-swing'), eq)).toBe(20);
    expect(roundLoad(23, getMovement('kb-swing'), eq)).toBe(24);
  });

  it('weighted bodyweight rounds added load to the belt step, never below zero', () => {
    const wpu = getMovement('weighted-pull-up');
    expect(roundLoad(11, wpu, eq)).toBe(10);
    expect(roundLoad(-5, wpu, eq)).toBe(0);
  });

  it('plate-loaded implements step by a pair of the smallest plates', () => {
    expect(roundLoad(41, getMovement('landmine-press'), eq)).toBe(40);
    expect(roundLoad(41.3, getMovement('landmine-press'), eq)).toBe(42.5);
  });

  it('bodyweight / erg movements have no load', () => {
    expect(roundLoad(50, getMovement('pull-up'), eq)).toBeNull();
    expect(roundLoad(50, getMovement('row'), eq)).toBeNull();
  });
});

describe('e1RM', () => {
  it('uses Epley on reps-to-failure (reps + RIR)', () => {
    expect(e1rm(100, 5, 0)).toBeCloseTo(116.67, 1);
    expect(e1rm(100, 5, 2)).toBeCloseTo(123.33, 1);
    expect(e1rm(100, 1, 0)).toBe(100);
    expect(e1rm(0, 5, 2)).toBe(0);
  });

  it('loadFor inverts e1rm', () => {
    for (const [r, k] of [[5, 2], [3, 1], [8, 3], [1, 0]] as const) {
      expect(e1rm(loadFor(150, r, k), r, k)).toBeCloseTo(150, 6);
    }
  });

  it('bestSetE1rm ignores warm-ups and unreliable very-high-rep sets', () => {
    expect(
      bestSetE1rm([
        { kind: 'warmup', loadKg: 200, reps: 5, rir: 0 },
        { kind: 'working', loadKg: 100, reps: 5, rir: 2 },
        { kind: 'working', loadKg: 40, reps: 30, rir: 0 },
      ]),
    ).toBeCloseTo(123.33, 1);
  });
});
