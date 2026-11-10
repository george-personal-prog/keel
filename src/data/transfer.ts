/**
 * Backup formats. Pure functions (unit-tested); the Dexie reads/writes live in store.ts.
 *
 * - JSON backup: everything except progress photos (size). Restorable with `parseBackup`.
 * - CSV: one row per logged set, and one row per conditioning piece, for spreadsheets.
 */

import { DAY_TEMPLATES, getMovement, migrateState, type SessionLog, type SkipEvent } from '../engine';
import type { BodyRow, MetaRow } from './db';

export const BACKUP_APP = 'keel';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  exportVersion: number;
  exportedAt: string;
  dbVersion?: number;
  meta: MetaRow[];
  sessions: SessionLog[];
  skips: (SkipEvent & { id?: number })[];
  body: BodyRow[];
}

export function makeBackup(parts: Omit<Backup, 'app' | 'exportVersion' | 'exportedAt'>, now = new Date()): Backup {
  return { app: BACKUP_APP, exportVersion: BACKUP_VERSION, exportedAt: now.toISOString(), ...parts };
}

export type ParseResult = { ok: true; backup: Backup; summary: string } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a backup file before anything touches the database. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON.' };
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) return { ok: false, error: 'This isn’t a Keel backup file.' };
  if (typeof raw.exportVersion !== 'number' || raw.exportVersion > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Keel. Update the app first.' };
  }
  for (const k of ['meta', 'sessions', 'skips', 'body'] as const) {
    if (!Array.isArray(raw[k])) return { ok: false, error: `The backup is missing its ${k}.` };
  }
  const sessions = raw.sessions as unknown[];
  for (const s of sessions) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.date !== 'string' || !ISO.test(s.date) || !Array.isArray(s.exercises)) {
      return { ok: false, error: 'A session in the backup is damaged.' };
    }
  }
  for (const s of raw.skips as unknown[]) {
    if (!isObj(s) || typeof s.date !== 'string' || !ISO.test(s.date) || !['motivation', 'busy', 'ill', 'away'].includes(String(s.reason))) {
      return { ok: false, error: 'A skipped day in the backup is damaged.' };
    }
  }
  const meta = raw.meta as unknown[];
  for (const m of meta) {
    if (!isObj(m) || !['settings', 'trackState', 'profile'].includes(String(m.key))) return { ok: false, error: 'The backup’s settings are damaged.' };
  }
  const state = meta.find((m) => isObj(m) && m.key === 'trackState') as MetaRow | undefined;
  if (state) {
    try {
      migrateState(state.value);
    } catch {
      return { ok: false, error: 'The backup’s training plan state is from an unsupported version.' };
    }
  }
  const backup = raw as unknown as Backup;
  const dates = backup.sessions.map((s) => s.date).sort();
  const summary =
    backup.sessions.length === 0
      ? 'No sessions in this backup.'
      : `${backup.sessions.length} session${backup.sessions.length > 1 ? 's' : ''} from ${dates[0]} to ${dates[dates.length - 1]}, ${backup.skips.length} skipped day${backup.skips.length === 1 ? '' : 's'}, ${backup.body.length} body entr${backup.body.length === 1 ? 'y' : 'ies'}.`;
  return { ok: true, backup, summary };
}

// ------------------------------------------------------------------ CSV

export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function sortedSessions(sessions: SessionLog[]) {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.sessionNumber - b.sessionNumber);
}

/** One row per logged set. */
export function setsCsv(sessions: SessionLog[]): string {
  const rows: unknown[][] = [
    ['date', 'session', 'day', 'phase', 'block', 'deload', 'partial', 'exercise', 'movement_id', 'scheme', 'set', 'kind', 'load_kg', 'reps', 'rir', 'target_reps', 'target_rir', 'technique_poor'],
  ];
  for (const s of sortedSessions(sessions)) {
    for (const ex of s.exercises) {
      let name = ex.movementId;
      try {
        name = getMovement(ex.movementId).name;
      } catch {
        /* keep the id */
      }
      ex.sets.forEach((x, i) =>
        rows.push([
          s.date,
          s.sessionNumber,
          DAY_TEMPLATES[s.dayTypeId]?.title ?? s.dayTypeId,
          s.phase,
          s.blockNumber,
          s.deload ? 1 : 0,
          s.partial ? 1 : 0,
          name,
          ex.movementId,
          ex.scheme,
          i + 1,
          x.kind,
          x.loadKg,
          x.reps,
          x.rir,
          x.targetReps,
          x.targetRir,
          x.techniquePoor ? 1 : '',
        ]),
      );
    }
  }
  return csv(rows);
}

/** One row per conditioning piece. */
export function conditioningCsv(sessions: SessionLog[]): string {
  const rows: unknown[][] = [
    ['date', 'session', 'name', 'format', 'benchmark', 'score_type', 'time_sec', 'rounds', 'reps', 'calories', 'metres', 'load_kg', 'splits', 'target_split', 'rx', 'duration_min', 'avg_hr', 'max_hr', 'zone_minutes'],
  ];
  for (const s of sortedSessions(sessions)) {
    const c = s.conditioning;
    if (!c) continue;
    const sc = c.score;
    rows.push([
      s.date,
      s.sessionNumber,
      c.name,
      c.format,
      c.benchmark,
      c.scoreType,
      sc.timeSec,
      sc.rounds,
      sc.reps,
      sc.calories,
      sc.metres,
      sc.loadKg,
      sc.splits?.join(' '),
      c.targetSplit,
      sc.rx === false ? 0 : 1,
      c.durationMin,
      c.hr?.avg,
      c.hr?.max,
      c.hr?.zonesSec?.map((z) => Math.round(z / 60)).join(' '),
    ]);
  }
  return csv(rows);
}
