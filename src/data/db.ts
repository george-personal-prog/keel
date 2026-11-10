/**
 * Local-first storage (IndexedDB via Dexie).
 *
 * Schema versions are append-only: never edit an existing `.version(n)` block; add a new one
 * with an `.upgrade()` when the shape changes. See docs/DECISIONS.md (T4).
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Draft } from '../app/draft';
import type { SessionLog, SkipEvent } from '../engine';

export interface MetaRow {
  key: 'settings' | 'trackState' | 'profile' | 'sync';
  value: unknown;
  /** ms timestamp of the last local change (drives sync conflict resolution). */
  savedAt?: number;
}

export interface Profile {
  onboardedAt: string;
}

export interface SkipRow extends SkipEvent {
  id?: number;
}

export interface BodyRow {
  id?: number;
  date: string;
  bodyweightKg?: number;
  girthsCm?: Record<string, number>;
  photoIds?: string[];
}

export interface PhotoRow {
  id: string;
  date: string;
  /** Small JPEG data URL for grids. */
  thumb: string;
  blob: Blob;
}

export class KeelDB extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  sessions!: EntityTable<SessionLog, 'id'>;
  skips!: EntityTable<SkipRow, 'id'>;
  drafts!: EntityTable<Draft, 'id'>;
  body!: EntityTable<BodyRow, 'id'>;
  photos!: EntityTable<PhotoRow, 'id'>;

  constructor(name = 'keel') {
    super(name);
    this.version(1).stores({
      meta: 'key',
      sessions: 'id, date, sessionNumber',
      skips: '++id, date',
      drafts: 'id',
      body: '++id, date',
    });
    // v2: local progress photos (never leave the device).
    this.version(2).stores({
      photos: 'id, date',
    });
  }
}

export const db = new KeelDB();

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
