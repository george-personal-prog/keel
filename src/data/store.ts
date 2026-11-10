/**
 * App data access: live queries + actions. Everything the screens need goes through here.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import {
  changeTrack,
  completeSession,
  createInitialState,
  declineDeload,
  DEFAULT_SETTINGS,
  migrateState,
  swapExercise,
  type History,
  type Settings,
  type SkipReason,
  type Track,
  type TrackState,
} from '../engine';
import type { TrackChangeTiming } from '../engine/state';
import { draftToSessionLog, type Draft } from '../app/draft';
import { db, type BodyRow, type Profile } from './db';
import { conditioningCsv, makeBackup, setsCsv, type Backup } from './transfer';

export interface AppData {
  settings: Settings;
  state: TrackState | null;
  profile: Profile | null;
  history: History;
  draft: Draft | null;
  body: BodyRow[];
}

/** Merge stored settings over defaults so new settings fields get sane values. */
function withDefaults(s: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    equipment: { ...DEFAULT_SETTINGS.equipment, ...(s?.equipment ?? {}) },
  };
}

export function useAppData(): AppData | undefined {
  return useLiveQuery(async () => {
    const [settingsRow, stateRow, profileRow, sessions, skips, draft, body] = await Promise.all([
      db.meta.get('settings'),
      db.meta.get('trackState'),
      db.meta.get('profile'),
      db.sessions.orderBy('date').toArray(),
      db.skips.orderBy('date').toArray(),
      db.drafts.get('current'),
      db.body.orderBy('date').toArray(),
    ]);
    return {
      settings: withDefaults(settingsRow?.value as Partial<Settings> | undefined),
      state: stateRow ? migrateState(stateRow.value) : null,
      profile: (profileRow?.value as Profile) ?? null,
      history: { sessions, skips: skips.map(({ date, reason }) => ({ date, reason })) },
      draft: draft ?? null,
      body,
    };
  }, []);
}

// ------------------------------------------------------------------ change hook

/** Cloud sync registers here; data changes then trigger a (debounced) background sync. */
let changeListener: (() => void) | null = null;
export function onLocalChange(fn: (() => void) | null): void {
  changeListener = fn;
}
function afterLocalChange(): void {
  changeListener?.();
}

// ------------------------------------------------------------------ dates

export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ------------------------------------------------------------------ actions

export async function onboard(track: Track, settings: Settings): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const savedAt = Date.now();
    await db.meta.put({ key: 'settings', value: settings, savedAt });
    await db.meta.put({ key: 'trackState', value: createInitialState(track, Math.floor(Math.random() * 1e9)), savedAt });
    await db.meta.put({ key: 'profile', value: { onboardedAt: localToday() } satisfies Profile, savedAt });
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.meta.put({ key: 'settings', value: settings, savedAt: Date.now() });
  afterLocalChange();
}

async function updateState(fn: (s: TrackState) => TrackState): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get('trackState');
    if (!row) throw new Error('No track state');
    await db.meta.put({ key: 'trackState', value: fn(migrateState(row.value)), savedAt: Date.now() });
  });
  afterLocalChange();
}

export const setTrack = (track: Track, timing: TrackChangeTiming) => updateState((s) => changeTrack(s, track, timing));
export const swapForBlock = (slotId: string, movementId: string) => updateState((s) => swapExercise(s, slotId, movementId));
export const declineDeloadToday = () => updateState((s) => declineDeload(s, localToday()));

export async function saveDraft(draft: Draft): Promise<void> {
  await db.drafts.put(draft);
}

export async function discardDraft(): Promise<void> {
  await db.drafts.delete('current');
}

/** Save the session, advance the queue, clear the draft: atomically. */
export async function finishSession(draft: Draft): Promise<string> {
  const id = `${draft.date}-${draft.prescription.sessionNumber}-${draft.startedAt.toString(36)}`;
  await db.transaction('rw', db.sessions, db.meta, db.drafts, async () => {
    await db.sessions.put(draftToSessionLog(draft, id, Date.now()));
    const row = await db.meta.get('trackState');
    if (row) await db.meta.put({ key: 'trackState', value: completeSession(migrateState(row.value), draft.prescription, draft.date), savedAt: Date.now() });
    await db.drafts.delete('current');
  });
  afterLocalChange();
  return id;
}

export async function recordSkip(reason: SkipReason, date = localToday()): Promise<void> {
  await db.skips.add({ date, reason });
  afterLocalChange();
}

export async function updateSessionNotes(id: string, notes: string): Promise<void> {
  await db.sessions.update(id, { notes: notes.trim() || undefined });
  afterLocalChange();
}

// ------------------------------------------------------------------ body

/** One body entry per day: saving again on the same day merges into it. */
export async function saveBodyEntry(entry: Omit<BodyRow, 'id'>): Promise<void> {
  await db.transaction('rw', db.body, async () => {
    const existing = await db.body.where('date').equals(entry.date).first();
    if (existing?.id != null) {
      await db.body.update(existing.id, {
        bodyweightKg: entry.bodyweightKg ?? existing.bodyweightKg,
        girthsCm: { ...(existing.girthsCm ?? {}), ...(entry.girthsCm ?? {}) },
      });
    } else {
      await db.body.add(entry);
    }
  });
  afterLocalChange();
}

export async function addPhoto(file: File, date = localToday()): Promise<void> {
  const thumb = await makeThumb(file, 360);
  await db.photos.put({ id: `${date}-${Date.now().toString(36)}`, date, thumb, blob: file });
}

export async function deletePhoto(id: string): Promise<void> {
  await db.photos.delete(id);
}

async function makeThumb(file: Blob, size: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = size / Math.max(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

// ------------------------------------------------------------------ export / import

export async function exportAll(): Promise<Blob> {
  const [meta, sessions, skips, body] = await Promise.all([db.meta.toArray(), db.sessions.toArray(), db.skips.toArray(), db.body.toArray()]);
  const payload = makeBackup({ dbVersion: db.verno, meta, sessions, skips, body });
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function exportCsv(kind: 'sets' | 'conditioning'): Promise<Blob> {
  const sessions = await db.sessions.toArray();
  return new Blob([kind === 'sets' ? setsCsv(sessions) : conditioningCsv(sessions)], { type: 'text/csv' });
}

/** Replace everything on this device with a validated backup (photos are untouched). */
export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', [db.meta, db.sessions, db.skips, db.body, db.drafts], async () => {
    await Promise.all([db.meta.clear(), db.sessions.clear(), db.skips.clear(), db.body.clear(), db.drafts.clear()]);
    await db.meta.bulkPut(backup.meta);
    await db.sessions.bulkPut(backup.sessions);
    await db.skips.bulkAdd(backup.skips.map(({ date, reason }) => ({ date, reason })));
    await db.body.bulkAdd(backup.body.map(({ id: _id, ...rest }) => rest));
  });
  afterLocalChange();
}

/** Trigger a file download (works in iOS standalone: opens the share/save sheet). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
