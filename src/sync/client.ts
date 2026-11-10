/**
 * Cloud backup controller for the UI. Loads the Firebase module only when backup is on,
 * syncs on sign-in, after data changes (debounced) and whenever the app comes back to the
 * foreground. Everything here is best-effort: the app never waits on the network.
 */
import { useSyncExternalStore } from 'react';
import { onLocalChange } from '../data/store';
import { isStandalone } from '../app/pwa';
import { FIREBASE_CONFIG } from './config';

export type SyncPhase = 'unconfigured' | 'off' | 'signed-out' | 'syncing' | 'ok' | 'error' | 'offline';

export interface SyncStatus {
  phase: SyncPhase;
  email?: string;
  lastSyncAt?: number;
  message?: string;
}

const ENABLED_KEY = 'keel.cloud';
let status: SyncStatus = { phase: FIREBASE_CONFIG ? 'off' : 'unconfigured' };
const listeners = new Set<() => void>();
function set(s: Partial<SyncStatus>) {
  status = { ...status, ...s };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

type Fb = typeof import('./firebase');
let fb: Fb | null = null;
let user: import('firebase/auth').User | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

function enabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'on';
  } catch {
    return false;
  }
}

async function load(): Promise<Fb> {
  if (fb) return fb;
  fb = await import('./firebase');
  fb.init(FIREBASE_CONFIG!, (u) => {
    user = u;
    if (u) {
      set({ email: u.email ?? undefined, message: undefined });
      void syncNow();
    } else set({ phase: 'signed-out', email: undefined, message: status.phase === 'signed-out' ? status.message : undefined });
  });
  onLocalChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 3000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  window.addEventListener('online', () => void syncNow());
  return fb;
}

/** Called once at startup: resumes cloud backup if it was on. */
export function startCloudBackup(): void {
  if (!FIREBASE_CONFIG || !enabled()) return;
  set({ phase: 'signed-out' });
  void load();
}

export async function turnOn(): Promise<void> {
  if (!FIREBASE_CONFIG) return;
  try {
    localStorage.setItem(ENABLED_KEY, 'on');
  } catch {
    /* ignore */
  }
  const f = await load();
  if (!user) {
    try {
      await f.signIn(isStandalone());
    } catch (e) {
      // Still signed out: keep offering sign-in, with the reason.
      set({ phase: 'signed-out', message: friendly(e) });
    }
  }
}

export async function turnOff(): Promise<void> {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  onLocalChange(null);
  if (fb && user) await fb.signOut();
  set({ phase: 'off', email: undefined });
}

export async function syncNow(): Promise<void> {
  if (!fb || !user) return;
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    set({ phase: 'offline' });
    return;
  }
  running = true;
  set({ phase: 'syncing', message: undefined });
  try {
    const r = await fb.syncNow(user);
    set({ phase: 'ok', lastSyncAt: r.at, message: r.pulled ? `${r.pulled} item${r.pulled > 1 ? 's' : ''} restored from the cloud` : undefined });
  } catch (e) {
    set({ phase: navigator.onLine ? 'error' : 'offline', message: friendly(e) });
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('popup-closed') || code.includes('cancelled')) return 'Sign-in was cancelled.';
  if (code.includes('popup-blocked')) return 'The sign-in window was blocked. Try again.';
  if (code.includes('unauthorized-domain')) return 'This web address isn’t authorised in Firebase yet.';
  if (code.includes('permission-denied')) return 'The cloud refused access (check the Firestore rules).';
  if (code.includes('network') || code.includes('unavailable')) return 'No connection. It will retry automatically.';
  return 'Backup failed. It will retry automatically.';
}
