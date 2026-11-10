import { describe, expect, it } from 'vitest';
import { baselineFromTest, BENCHMARKS, buildConditioning, INTERVALS, intervalTarget, nextBenchmark, type ConditioningContext } from '../conditioning';
import { prescribeNextSession } from '../generate';
import { DAY_TEMPLATES } from '../templates';
import type { History, LoggedConditioning } from '../types';
import { athlete, emptyHistory, ex, input, log, settings, simulate } from './helpers';

function withConditioning(...cs: Partial<LoggedConditioning>[]): History {
  return {
    sessions: cs.map((c, i) =>
      log(`2026-01-${String(i + 1).padStart(2, '0')}`, [], {
        conditioning: { wodId: 'x', name: 'x', format: 'test', scoreType: 'time', score: {}, ...c },
      }),
    ),
    skips: [],
  };
}

const ctx = (over: Partial<ConditioningContext> = {}): ConditioningContext => ({
  spec: DAY_TEMPLATES['off-upper-press'].conditioning!,
  history: emptyHistory(),
  settings,
  seed: 1,
  sessionNumber: 10,
  dayId: 'off-upper-press',
  avoidPatterns: [],
  mode: 'normal',
  ...over,
});

describe('erg baselines & interval targets', () => {
  const row2k = withConditioning({ wodId: 'test:row-2k', score: { timeSec: 400 } }); // 1:40/500m
  const rowRepeats = INTERVALS.find((i) => i.id === 'int:row-500')!;

  it('derives pace per 500 m from a distance test and cal/min from the bike test', () => {
    expect(baselineFromTest(row2k, 'test:row-2k')).toBe(100);
    expect(baselineFromTest(withConditioning({ wodId: 'test:air-bike-10', score: { calories: 180 } }), 'test:air-bike-10')).toBe(18);
  });

  it('no baseline → effort-based guidance', () => {
    const t = intervalTarget(emptyHistory(), rowRepeats);
    expect(t.target).toBeUndefined();
    expect(t.why).toMatch(/No test baseline/);
  });

  it('target = test pace + offset', () => {
    expect(intervalTarget(row2k, rowRepeats).target).toBe(97);
  });

  it('every rep on target last time → 1 s faster; faded → ease off; close → hold', () => {
    const hit = { ...row2k, sessions: [...row2k.sessions, ...withConditioning({ wodId: 'int:row-500', targetSplit: 97, score: { splits: [96, 97, 96.5, 97] } }).sessions] };
    expect(intervalTarget(hit, rowRepeats).target).toBe(96);
    const faded = { ...row2k, sessions: [...row2k.sessions, ...withConditioning({ wodId: 'int:row-500', targetSplit: 97, score: { splits: [97, 99, 101, 103] } }).sessions] };
    expect(intervalTarget(faded, rowRepeats).target).toBe(98);
    const close = { ...row2k, sessions: [...row2k.sessions, ...withConditioning({ wodId: 'int:row-500', targetSplit: 97, score: { splits: [97, 98, 97.5] } }).sessions] };
    expect(intervalTarget(close, rowRepeats).target).toBe(97);
  });

  it('calorie intervals progress by +1 cal when every round hits', () => {
    const bike = INTERVALS.find((i) => i.id === 'int:bike-60-60')!;
    const h = withConditioning({ wodId: 'test:air-bike-10', score: { calories: 160 } }, { wodId: 'int:bike-60-60', targetSplit: 20, score: { splits: [20, 21, 20, 20] } });
    expect(intervalTarget(h, bike).target).toBe(21);
  });
});

describe('generated WODs', () => {
  it('are deterministic per session and vary across sessions', () => {
    const a = buildConditioning(ctx());
    expect(buildConditioning(ctx())).toEqual(a);
    const names = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(buildConditioning(ctx({ sessionNumber: i })).components)));
    expect(names.size).toBeGreaterThan(5);
  });

  it('stay inside the spec duration', () => {
    for (const day of Object.values(DAY_TEMPLATES)) {
      if (!day.conditioning) continue;
      for (let i = 0; i < 10; i++) {
        const w = buildConditioning(ctx({ spec: day.conditioning, dayId: day.id, sessionNumber: i }));
        expect(w.durationMin, `${day.id} ${w.name}`).toBeLessThanOrEqual(day.conditioning.minutes[1] + 2);
        expect(w.components.length).toBeGreaterThan(0);
      }
    }
  });

  it('avoid patterns trained heavily earlier in the session', () => {
    for (let i = 0; i < 30; i++) {
      const w = buildConditioning(ctx({ spec: { emphasis: 'mixed', formats: ['amrap'], minutes: [10, 12], priority: 3 }, sessionNumber: i, avoidPatterns: ['hinge', 'squat'] }));
      expect(w.components.map((c) => c.movementId)).not.toContain('deadlift');
      expect(w.components.map((c) => c.movementId)).not.toContain('front-squat');
    }
  });

  it('barbell loads are capped at ~60% of the athlete’s own max, never above Rx', () => {
    const weak: History = {
      sessions: [log('2026-01-01', [ex('deadlift', [{ kind: 'top', loadKg: 120, reps: 5, rir: 2 }])])],
      skips: [],
    };
    const strong: History = {
      sessions: [log('2026-01-01', [ex('deadlift', [{ kind: 'top', loadKg: 250, reps: 5, rir: 2 }])])],
      skips: [],
    };
    const find = (h: History) => {
      for (let i = 0; i < 200; i++) {
        const w = buildConditioning(ctx({ history: h, sessionNumber: i, spec: { emphasis: 'barbell-cycling', formats: ['for-time'], minutes: [12, 14], priority: 3 } }));
        const c = w.components.find((x) => x.movementId === 'deadlift');
        if (c) return c;
      }
      throw new Error('no deadlift WOD generated');
    };
    const w = find(weak);
    expect(w.loadKg!).toBeLessThanOrEqual(148 * 0.6);
    expect(w.note).toMatch(/Rx 100 kg/);
    expect(find(strong).loadKg).toBe(100);
  });
});

describe('benchmarks', () => {
  it('least-recently-performed benchmark comes next', () => {
    const h = withConditioning({ wodId: 'bm:amanda' }, { wodId: 'bm:annie' });
    const next = nextBenchmark(h, (b) => b.kind !== 'erg-test');
    expect(['bm:amanda', 'bm:annie']).not.toContain(next!.id);
  });

  it('the previous score becomes the target', () => {
    const fran = BENCHMARKS.find((b) => b.id === 'bm:fran')!;
    const h = withConditioning({ wodId: 'bm:fran', score: { timeSec: 245 } });
    const w = buildConditioning(ctx({ history: h, mode: 'calibration', calibrationIndex: 1 }));
    expect(w.benchmark).toBe(fran.name);
    expect(w.target).toBe('Beat 4:05');
  });

  it('the last week of every block contains a benchmark retest and an erg test', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 24, athlete());
    const lastWeek = r.prescriptions.slice(4 + 20, 4 + 24);
    const ids = lastWeek.map((p) => p.conditioning?.id ?? '');
    expect(ids.some((id) => id.startsWith('bm:'))).toBe(true);
    expect(ids.some((id) => id.startsWith('test:'))).toBe(true);
    const earlier = r.prescriptions.slice(4, 4 + 20).map((p) => p.conditioning?.id ?? '');
    expect(earlier.filter((id) => id.startsWith('bm:') || id.startsWith('test:'))).toEqual([]);
  });

  it('erg tests during calibration set the baselines used straight after', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4, athlete());
    expect(baselineFromTest(r.history, 'test:row-2k')).toBe(100);
    // the pull day carries erg intervals with a concrete target
    let p = prescribeNextSession(input(r.state, r.history, r.date));
    let guard = 0;
    while (p.conditioning?.format !== 'intervals' && guard++ < 4) {
      r.state = { ...r.state, cursor: r.state.cursor + 1 };
      p = prescribeNextSession(input(r.state, r.history, r.date));
    }
    expect(p.conditioning?.intervals?.target ?? p.conditioning?.why).toBeTruthy();
  });
});
