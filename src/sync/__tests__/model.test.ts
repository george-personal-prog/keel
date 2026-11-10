import { describe, expect, it } from 'vitest';
import { createInitialState, type SessionLog } from '../../engine';
import { athlete, simulate } from '../../engine/__tests__/helpers';
import { conditioningCsv, csvCell, makeBackup, parseBackup, setsCsv } from '../../data/transfer';
import { hashDoc, localDocs, planMerge, planPush, stableStringify, type LocalSnapshot } from '../model';

function snapshot(sessions: SessionLog[] = [], completed = 0, savedAt = 1): LocalSnapshot {
  return {
    meta: [
      { key: 'trackState', value: { ...createInitialState({ focus: 'off-season', frequency: 4 }), completedSessions: completed }, savedAt },
      { key: 'settings', value: { sessionBudgetMin: 60 }, savedAt },
      { key: 'sync', value: { hashes: {} } },
    ],
    sessions,
    skips: [{ date: '2026-01-02', reason: 'busy' }],
    body: [{ id: 1, date: '2026-01-03', bodyweightKg: 86, girthsCm: { waist: 84 } }],
  };
}

const sim = () => simulate({ focus: 'off-season', frequency: 4 }, 6, athlete()).history.sessions;

describe('documents & hashing', () => {
  it('stable hashing ignores key order and undefined', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(hashDoc({ a: 1, b: 2 })).toBe(hashDoc({ b: 2, a: 1 }));
    expect(hashDoc({ a: 1 })).not.toBe(hashDoc({ a: 2 }));
  });

  it('maps local data to deterministic paths and never syncs the sync record itself', () => {
    const docs = localDocs(snapshot(sim()));
    const paths = [...docs.keys()];
    expect(paths.filter((p) => p.startsWith('sessions/'))).toHaveLength(6);
    expect(paths).toContain('skips/2026-01-02_busy');
    expect(paths).toContain('body/2026-01-03');
    expect(paths).toContain('meta/trackState');
    expect(paths).not.toContain('meta/sync');
    expect(docs.get('body/2026-01-03')).not.toHaveProperty('id');
    // Firestore-safe: no undefined values anywhere
    for (const d of docs.values()) expect(JSON.stringify(d)).toBe(JSON.stringify(JSON.parse(JSON.stringify(d))));
  });

  it('pushes only what changed since the last sync', () => {
    const local = snapshot(sim());
    const first = planPush(localDocs(local), {});
    expect(first.length).toBe(localDocs(local).size);
    const hashes = Object.fromEntries(first.map((p) => [p.path, p.hash]));
    expect(planPush(localDocs(local), hashes)).toEqual([]);
    local.sessions[0] = { ...local.sessions[0], notes: 'felt strong' };
    const again = planPush(localDocs(local), hashes);
    expect(again.map((p) => p.path)).toEqual([`sessions/${local.sessions[0].id}`]);
  });
});

describe('merge from the cloud', () => {
  it('a fresh phone restores everything from the cloud', () => {
    const remote = localDocs(snapshot(sim(), 6, 100));
    const empty: LocalSnapshot = { meta: [], sessions: [], skips: [], body: [] };
    const plan = planMerge(empty, remote);
    expect(plan.sessionsToAdd).toHaveLength(6);
    expect(plan.skipsToAdd).toEqual([{ date: '2026-01-02', reason: 'busy' }]);
    expect(plan.bodyToPut[0]).toMatchObject({ date: '2026-01-03', bodyweightKg: 86 });
    expect(plan.metaToPut.map((m) => m.key).sort()).toEqual(['settings', 'trackState']);
    expect(Object.keys(plan.pulled).length).toBe(remote.size);
  });

  it('union of sessions; local copy wins on the same id', () => {
    const sessions = sim();
    const local = snapshot(sessions.slice(0, 4).map((s) => ({ ...s, notes: 'local' })), 4);
    const remote = localDocs(snapshot(sessions, 6));
    const plan = planMerge(local, remote);
    expect(plan.sessionsToAdd.map((s) => s.id)).toEqual(sessions.slice(4).map((s) => s.id));
  });

  it('the training state that has progressed further wins, regardless of timestamps', () => {
    const behind = planMerge(snapshot([], 10, 999), localDocs(snapshot([], 12, 1)));
    expect(behind.metaToPut.find((m) => m.key === 'trackState')).toBeDefined();
    const ahead = planMerge(snapshot([], 12, 1), localDocs(snapshot([], 10, 999)));
    expect(ahead.metaToPut.find((m) => m.key === 'trackState')).toBeUndefined();
    // settings: newest wins
    expect(ahead.metaToPut.find((m) => m.key === 'settings')).toBeDefined();
  });

  it('body entries merge per day; local values win', () => {
    const local = snapshot();
    const remoteSnap = snapshot();
    remoteSnap.body = [{ date: '2026-01-03', bodyweightKg: 90, girthsCm: { waist: 80, arm: 41 } }];
    const plan = planMerge(local, localDocs(remoteSnap));
    expect(plan.bodyToPut).toEqual([{ date: '2026-01-03', bodyweightKg: 86, girthsCm: { waist: 84, arm: 41 } }]);
  });

  it('an unreadable remote training state never replaces a good local one', () => {
    const remote = localDocs(snapshot([], 50, 999));
    remote.set('meta/trackState', { value: { schemaVersion: 99 }, savedAt: 999 });
    const plan = planMerge(snapshot([], 1, 1), remote);
    expect(plan.metaToPut.find((m) => m.key === 'trackState')).toBeUndefined();
  });
});

describe('backup files', () => {
  const backup = () => makeBackup({ meta: snapshot().meta.filter((m) => m.key !== 'sync'), sessions: sim(), skips: [{ date: '2026-01-02', reason: 'ill' }], body: [] });

  it('round-trips a valid backup with a readable summary', () => {
    const r = parseBackup(JSON.stringify(backup()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toMatch(/^6 sessions from \d{4}-\d{2}-\d{2} to/);
  });

  it('rejects junk, other apps, newer versions and damaged records', () => {
    expect(parseBackup('nope')).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: 'other' }))).toMatchObject({ ok: false, error: /isn’t a Keel backup/ });
    expect(parseBackup(JSON.stringify({ ...backup(), exportVersion: 99 }))).toMatchObject({ ok: false, error: /newer version/ });
    const bad = backup();
    (bad.sessions[0] as unknown as Record<string, unknown>).date = '1/1/26';
    expect(parseBackup(JSON.stringify(bad))).toMatchObject({ ok: false, error: /damaged/ });
    const badState = backup();
    badState.meta = [{ key: 'trackState', value: { schemaVersion: 7 } }];
    expect(parseBackup(JSON.stringify(badState))).toMatchObject({ ok: false, error: /unsupported/ });
  });
});

describe('CSV', () => {
  it('escapes cells properly', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(102.5)).toBe('102.5');
  });

  it('one row per logged set, one per conditioning piece', () => {
    const sessions = sim();
    const sets = setsCsv(sessions).trim().split('\r\n');
    const total = sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
    expect(sets).toHaveLength(total + 1);
    expect(sets[0]).toMatch(/^date,session,day,phase/);
    const cond = conditioningCsv(sessions).trim().split('\r\n');
    expect(cond).toHaveLength(sessions.filter((s) => s.conditioning).length + 1);
  });
});
