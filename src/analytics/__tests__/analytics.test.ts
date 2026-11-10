import { describe, expect, it } from 'vitest';
import { athlete, ex, log, simulate } from '../../engine/__tests__/helpers';
import type { History, LoggedConditioning } from '../../engine';
import { addDays } from '../../engine/util';
import {
  adherence,
  benchmarkHistories,
  blockSummaries,
  bodySeries,
  e1rmSeries,
  lastWeeks,
  liftSeries,
  repPRs,
  trackedLifts,
  trainingLoad,
  trendPerWeek,
  weekStart,
  weeklyVolume,
} from '../index';
import { achievementsForSession, badgeCatalog, computeAchievements } from '../badges';

const top = (loadKg: number, reps: number, rir = 2) => ({ kind: 'top' as const, loadKg, reps, rir, targetReps: reps, targetRir: 2 });

function squatHistory(loads: number[], start = '2026-01-05'): History {
  return { sessions: loads.map((l, i) => log(addDays(start, i * 7), [ex('back-squat', [top(l, 5)])])), skips: [] };
}

describe('dates', () => {
  it('weekStart is the Monday', () => {
    expect(weekStart('2026-11-10')).toBe('2026-11-09'); // Tue → Mon
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // Sun
    expect(lastWeeks('2026-11-10', 3)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  });
});

describe('strength analytics', () => {
  it('e1RM series flags PRs after the first exposure', () => {
    const s = e1rmSeries(squatHistory([100, 105, 102.5, 110]), 'back-squat');
    expect(s.map((p) => p.pr)).toEqual([false, true, false, true]);
    expect(s[0].e1rm).toBeCloseTo(100 * (1 + 7 / 30), 5);
  });

  it('trend is kg per week from a least-squares fit', () => {
    const s = e1rmSeries(squatHistory([100, 102.5, 105, 107.5]), 'back-squat');
    expect(trendPerWeek(s)).toBeCloseTo(2.5 * (1 + 7 / 30), 3);
    expect(trendPerWeek(s.slice(0, 2))).toBeUndefined();
  });

  it('Olympic lifts chart the heaviest clean make, not an e1RM', () => {
    const h: History = {
      sessions: [
        log('2026-01-05', [ex('snatch', [{ kind: 'working', loadKg: 80, reps: 1, rir: 1, targetReps: 1 }, { kind: 'working', loadKg: 85, reps: 0, rir: 0, targetReps: 1 }], { scheme: 'olympic' })]),
        log('2026-01-12', [ex('snatch', [{ kind: 'working', loadKg: 84, reps: 1, rir: 1, targetReps: 1, techniquePoor: true }], { scheme: 'olympic' })]),
      ],
      skips: [],
    };
    const s = liftSeries(h, 'snatch');
    expect(s.metric).toBe('best-make');
    expect(s.points.map((p) => p.e1rm)).toEqual([80]);
  });

  it('rep-PR table keeps only the meaningful frontier', () => {
    const h: History = {
      sessions: [
        log('2026-01-05', [ex('back-squat', [top(140, 5), top(120, 8), { ...top(130, 3) }])]),
        log('2026-01-12', [ex('back-squat', [top(150, 3), top(118, 10)])]),
      ],
      skips: [],
    };
    const prs = repPRs(h, 'back-squat');
    // 130×3 is dominated by 140×5, then replaced by 150×3
    expect(prs.map((p) => `${p.reps}:${p.loadKg}`)).toEqual(['3:150', '5:140', '8:120', '10:118']);
  });

  it('tracked lifts put main lifts first', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 12, athlete());
    const lifts = trackedLifts(r.history);
    expect(lifts.slice(0, 3)).toEqual(['back-squat', 'deadlift', 'incline-bench-press']);
  });
});

describe('volume, adherence, load', () => {
  it('weekly volume counts hard sets per muscle and weak points show up', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 8, athlete(), { date: '2026-01-05' });
    const w = weeklyVolume(r.history, r.date, 4);
    expect(w).toHaveLength(4);
    const full = w[w.length - 2];
    expect(full.sessions).toBe(4);
    expect(full.hardSets).toBeGreaterThan(40);
    expect(full.muscles['delts-side']!).toBeGreaterThan(full.muscles.chest ?? 0);
    expect(full.hrLoad).toBeGreaterThan(0);
  });

  it('adherence: streak counts full weeks at target; skips are tallied', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 16, athlete(), { date: '2026-01-05' });
    const h = { ...r.history, skips: [{ date: '2026-01-20', reason: 'busy' as const }] };
    const a = adherence(h, '2026-02-03', 4, 8);
    expect(a.streak).toBe(4);
    expect(a.rate).toBe(1);
    expect(a.skipReasons.busy).toBe(1);
    const lazy = adherence(h, '2026-02-03', 5, 8);
    expect(lazy.streak).toBe(0);
    expect(lazy.rate).toBeCloseTo(0.8);
  });

  it('training load: zones when logged, else average HR zone × minutes', () => {
    const c: LoggedConditioning = { wodId: 'x', name: 'x', format: 'amrap', scoreType: 'rounds-reps', score: {}, durationMin: 12, hr: { avg: 165 } };
    expect(trainingLoad(c, 190)).toEqual({ load: 12 * 4, method: 'average' });
    const z = { ...c, hr: { zonesSec: [60, 120, 180, 240, 60] } };
    expect(trainingLoad(z, 190)).toEqual({ load: 1 + 4 + 9 + 16 + 5, method: 'zones' });
    expect(trainingLoad({ ...c, hr: undefined }, 190)).toBeUndefined();
  });
});

describe('conditioning & blocks', () => {
  const bm = (date: string, timeSec: number, rx = true) =>
    log(date, [], { conditioning: { wodId: 'bm:fran', name: 'Fran', format: 'for-time', scoreType: 'time', score: { timeSec, rx } } });

  it('benchmark history: lower is better for time; scaled results never PR', () => {
    const h: History = { sessions: [bm('2026-01-01', 300), bm('2026-02-01', 280, false), bm('2026-03-01', 290)], skips: [] };
    const [fran] = benchmarkHistories(h);
    expect(fran.direction).toBe('lower');
    expect(fran.results.map((r) => r.pr)).toEqual([false, false, true]);
    expect(fran.best?.label).toBe('4:50');
  });

  it('block summaries report sessions, lift changes and weak-point sets per week', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 28, athlete({ gainPerSession: 0.004 }));
    const blocks = blockSummaries(r.history);
    expect(blocks[0].blockNumber).toBe(2);
    const b1 = blocks.find((b) => b.blockNumber === 1)!;
    expect(b1.sessions).toBe(24);
    expect(b1.weeks).toBeGreaterThanOrEqual(6);
    const squat = b1.liftChanges.find((l) => l.movementId === 'back-squat')!;
    expect(squat.to).toBeGreaterThan(squat.from);
    expect(b1.weakPointSetsPerWeek).toBeGreaterThan(20);
  });

  it('body series sorts by date and skips missing values', () => {
    const s = bodySeries([{ date: '2026-02-01', bodyweightKg: 86 }, { date: '2026-01-01', bodyweightKg: 87 }, { date: '2026-01-15' }], 'bodyweight');
    expect(s).toEqual([{ date: '2026-01-01', value: 87 }, { date: '2026-02-01', value: 86 }]);
  });
});

describe('achievements', () => {
  it('a 12-week simulated athlete earns real milestones, with evidence', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 48, athlete({ gainPerSession: 0.004 }), { date: '2026-01-05' });
    const all = computeAchievements(r.history, 4);
    const ids = new Set(all.map((a) => a.id));
    for (const id of ['sessions-1', 'sessions-10', 'sessions-25', 'sessions-50', 'calibrated', 'streak-4', 'streak-8', 'streak-12', 'blocks-1', 'first-benchmark']) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(all.some((a) => a.kind === 'e1rm-pr' && a.title.startsWith('Back Squat'))).toBe(true);
    expect(all.some((a) => a.kind === 'rep-pr')).toBe(true);
    for (const a of all) expect(a.detail.length).toBeGreaterThan(3);
    // dated in order, badges unique
    const badgeIds = all.filter((a) => a.kind === 'badge').map((a) => a.id);
    expect(new Set(badgeIds).size).toBe(badgeIds.length);
  });

  it('no PRs from calibration or the second exposure; per-session lookup works', () => {
    const h = squatHistory([100, 110, 115]);
    const all = computeAchievements(h, 4);
    const prs = all.filter((a) => a.kind === 'e1rm-pr');
    expect(prs).toHaveLength(1);
    expect(achievementsForSession(all, h.sessions[2].id).some((a) => a.kind === 'e1rm-pr')).toBe(true);
  });

  it('a stalled athlete does not get showered with PRs', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 24, athlete({ gainPerSession: 0 }));
    const prs = computeAchievements(r.history, 4).filter((a) => a.kind === 'e1rm-pr');
    expect(prs.length).toBeLessThan(10);
  });

  it('every earnable badge is in the catalog', () => {
    const r = simulate({ focus: 'off-season', frequency: 4 }, 4 + 48, athlete());
    const cat = new Set(badgeCatalog().map((b) => b.id));
    for (const a of computeAchievements(r.history, 4).filter((x) => x.kind === 'badge')) expect(cat.has(a.id), a.id).toBe(true);
  });
});
