import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../data/db';
import { exportAll, restoreBackup, saveBodyEntry } from '../../data/store';
import { parseBackup } from '../../data/transfer';
import { athlete, simulate } from '../../engine/__tests__/helpers';
import { localDocs, planMerge } from '../model';
import { applyMerge, readSnapshot } from '../local';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const r = simulate({ focus: 'off-season', frequency: 4 }, 8, athlete());
  await db.sessions.bulkPut(r.history.sessions);
  await db.meta.put({ key: 'trackState', value: r.state, savedAt: 5 });
  await db.skips.add({ date: '2026-01-20', reason: 'ill' });
  await saveBodyEntry({ date: '2026-01-21', bodyweightKg: 86 });
  return r;
}

describe('IndexedDB round-trips', () => {
  it('export → parse → restore reproduces the data', async () => {
    await seed();
    const text = await (await exportAll()).text();
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    await Promise.all(db.tables.map((t) => t.clear()));
    if (parsed.ok) await restoreBackup(parsed.backup);
    const snap = await readSnapshot();
    expect(snap.sessions).toHaveLength(8);
    expect(snap.skips).toEqual([{ date: '2026-01-20', reason: 'ill' }]);
    expect(snap.body[0]).toMatchObject({ date: '2026-01-21', bodyweightKg: 86 });
    expect(snap.meta.find((m) => m.key === 'trackState')).toBeDefined();
  });

  it('applying a cloud merge onto a blank phone restores it', async () => {
    await seed();
    const remote = localDocs(await readSnapshot());
    await Promise.all(db.tables.map((t) => t.clear()));
    const n = await applyMerge(planMerge(await readSnapshot(), remote));
    expect(n).toBeGreaterThan(8);
    const snap = await readSnapshot();
    expect(snap.sessions).toHaveLength(8);
    // merging the same data again is a no-op
    expect(await applyMerge(planMerge(snap, remote))).toBe(0);
  });

  it('body entries stay one per day', async () => {
    await saveBodyEntry({ date: '2026-02-01', bodyweightKg: 85, girthsCm: { waist: 83 } });
    await saveBodyEntry({ date: '2026-02-01', girthsCm: { arm: 41 } });
    const rows = await db.body.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bodyweightKg: 85, girthsCm: { waist: 83, arm: 41 } });
  });
});
