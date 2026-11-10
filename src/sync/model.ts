/**
 * Cloud sync model (pure, unit-tested; no Firebase imports).
 *
 * Firestore layout, all under users/{uid}/:
 *   sessions/{sessionId}        a SessionLog
 *   skips/{date}_{reason}       a SkipEvent (deterministic id: device-independent)
 *   body/{date}                 one body entry per day
 *   meta/{settings|trackState|profile}  { value, savedAt }
 * Progress photos are not synced (privacy and size).
 *
 * The device's IndexedDB stays the source of truth. A sync:
 *   1. pulls every remote doc and merges it in (union by id; for meta the newer/advanced wins),
 *   2. pushes only docs whose content hash changed since the last sync.
 */

import { migrateState, type SessionLog, type SkipEvent, type TrackState } from '../engine';
import { hashString } from '../engine/util';
import type { BodyRow, MetaRow } from '../data/db';

export type Collection = 'sessions' | 'skips' | 'body' | 'meta';
export const COLLECTIONS: Collection[] = ['sessions', 'skips', 'body', 'meta'];
export const SYNCED_META = ['settings', 'trackState', 'profile'] as const;

export interface LocalSnapshot {
  meta: MetaRow[];
  sessions: SessionLog[];
  skips: SkipEvent[];
  body: BodyRow[];
}

/** path ("sessions/abc") -> JSON-safe document */
export type DocMap = Map<string, Record<string, unknown>>;

export interface SyncState {
  uid?: string;
  email?: string;
  lastSyncAt?: number;
  /** path -> content hash at the last successful push/pull */
  hashes: Record<string, string>;
}

/** JSON round-trip: drops undefined (Firestore rejects it) and class instances. */
export function plain<T>(x: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(x)) as Record<string, unknown>;
}

/** Stable stringify (sorted keys) so equal content always hashes equal. */
export function stableStringify(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stableStringify).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x as object)
      .sort()
      .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x);
}

export function hashDoc(doc: unknown): string {
  const s = stableStringify(doc);
  return `${hashString(s).toString(36)}${s.length.toString(36)}`;
}

export const skipId = (s: SkipEvent) => `${s.date}_${s.reason}`;

export function localDocs(local: LocalSnapshot): DocMap {
  const out: DocMap = new Map();
  for (const s of local.sessions) out.set(`sessions/${s.id}`, plain(s));
  for (const s of local.skips) out.set(`skips/${skipId(s)}`, plain({ date: s.date, reason: s.reason }));
  for (const b of local.body) {
    const { id: _id, ...rest } = b;
    out.set(`body/${b.date}`, plain(rest));
  }
  for (const m of local.meta) {
    if (!(SYNCED_META as readonly string[]).includes(m.key)) continue;
    out.set(`meta/${m.key}`, plain({ value: m.value, savedAt: m.savedAt ?? 0 }));
  }
  return out;
}

/** Docs whose content changed since the last sync. */
export function planPush(docs: DocMap, hashes: Record<string, string>): { path: string; data: Record<string, unknown>; hash: string }[] {
  const out: { path: string; data: Record<string, unknown>; hash: string }[] = [];
  for (const [path, data] of docs) {
    const h = hashDoc(data);
    if (hashes[path] !== h) out.push({ path, data, hash: h });
  }
  return out;
}

export interface MergePlan {
  sessionsToAdd: SessionLog[];
  skipsToAdd: SkipEvent[];
  bodyToPut: Omit<BodyRow, 'id'>[];
  metaToPut: MetaRow[];
  /** Remote paths now reflected locally, with their hashes (so they aren't pushed straight back). */
  pulled: Record<string, string>;
}

function trackProgress(v: unknown): number {
  try {
    return migrateState(v).completedSessions;
  } catch {
    return -1;
  }
}

/**
 * Merge remote docs into local data.
 * - sessions/skips: union by id (local wins on the same id; it is the device being used).
 * - body: union by date; girths merged, local values win.
 * - meta: trackState follows the most completed sessions (then newest); other meta newest wins.
 */
export function planMerge(local: LocalSnapshot, remote: DocMap): MergePlan {
  const plan: MergePlan = { sessionsToAdd: [], skipsToAdd: [], bodyToPut: [], metaToPut: [], pulled: {} };
  const sessionIds = new Set(local.sessions.map((s) => s.id));
  const skipIds = new Set(local.skips.map(skipId));
  const bodyByDate = new Map(local.body.map((b) => [b.date, b]));
  const metaByKey = new Map(local.meta.map((m) => [m.key, m]));

  for (const [path, data] of remote) {
    const [col, id] = path.split('/') as [Collection, string];
    const h = hashDoc(data);
    if (col === 'sessions') {
      if (!sessionIds.has(id)) {
        plan.sessionsToAdd.push(data as unknown as SessionLog);
        plan.pulled[path] = h;
      }
    } else if (col === 'skips') {
      if (!skipIds.has(id)) {
        plan.skipsToAdd.push({ date: String(data.date), reason: data.reason as SkipEvent['reason'] });
        plan.pulled[path] = h;
      }
    } else if (col === 'body') {
      const r = data as unknown as BodyRow;
      const l = bodyByDate.get(id);
      if (!l) {
        plan.bodyToPut.push({ ...r, date: id });
        plan.pulled[path] = h;
      } else {
        const girths = { ...(r.girthsCm ?? {}), ...(l.girthsCm ?? {}) };
        const merged = { date: id, bodyweightKg: l.bodyweightKg ?? r.bodyweightKg, girthsCm: girths };
        if (stableStringify(merged) !== stableStringify({ date: id, bodyweightKg: l.bodyweightKg, girthsCm: l.girthsCm ?? {} })) {
          plan.bodyToPut.push(merged);
        }
      }
    } else if (col === 'meta') {
      const key = id as MetaRow['key'];
      const remoteRow: MetaRow = { key, value: data.value, savedAt: Number(data.savedAt ?? 0) };
      const l = metaByKey.get(key);
      let takeRemote: boolean;
      if (!l) takeRemote = true;
      else if (key === 'trackState') {
        const rp = trackProgress(remoteRow.value);
        const lp = trackProgress(l.value);
        takeRemote = rp > lp || (rp === lp && (remoteRow.savedAt ?? 0) > (l.savedAt ?? 0));
      } else takeRemote = (remoteRow.savedAt ?? 0) > (l.savedAt ?? 0);
      if (takeRemote) {
        if (key === 'trackState' && trackProgress(remoteRow.value) < 0) continue; // unreadable: keep local
        plan.metaToPut.push(remoteRow);
        plan.pulled[path] = h;
      }
    }
  }
  return plan;
}

/** After a merge, the trackState must be a valid state of the current schema. */
export function isUsableTrackState(v: unknown): v is TrackState {
  return trackProgress(v) >= 0;
}
