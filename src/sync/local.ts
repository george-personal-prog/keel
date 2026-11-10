/** Dexie side of sync: snapshot local data, apply a merge plan, remember hashes. */

import { db, type MetaRow } from '../data/db';
import type { LocalSnapshot, MergePlan, SyncState } from './model';

export async function readSnapshot(): Promise<LocalSnapshot> {
  const [meta, sessions, skips, body] = await Promise.all([db.meta.toArray(), db.sessions.toArray(), db.skips.toArray(), db.body.toArray()]);
  return { meta, sessions, skips: skips.map(({ date, reason }) => ({ date, reason })), body };
}

export async function readSyncState(): Promise<SyncState> {
  const row = await db.meta.get('sync');
  return (row?.value as SyncState | undefined) ?? { hashes: {} };
}

export async function writeSyncState(s: SyncState): Promise<void> {
  await db.meta.put({ key: 'sync', value: s });
}

/** Apply a merge plan atomically. Returns how many records arrived from the cloud. */
export async function applyMerge(plan: MergePlan): Promise<number> {
  let n = 0;
  await db.transaction('rw', [db.meta, db.sessions, db.skips, db.body], async () => {
    if (plan.sessionsToAdd.length) await db.sessions.bulkPut(plan.sessionsToAdd);
    if (plan.skipsToAdd.length) await db.skips.bulkAdd(plan.skipsToAdd);
    for (const b of plan.bodyToPut) {
      const existing = await db.body.where('date').equals(b.date).first();
      if (existing?.id != null) await db.body.update(existing.id, { bodyweightKg: b.bodyweightKg, girthsCm: b.girthsCm });
      else await db.body.add(b);
    }
    for (const m of plan.metaToPut) await db.meta.put(m as MetaRow);
    n = plan.sessionsToAdd.length + plan.skipsToAdd.length + plan.bodyToPut.length + plan.metaToPut.length;
  });
  return n;
}
