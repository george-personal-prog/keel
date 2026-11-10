/**
 * Firebase client (lazy-loaded: only downloaded once cloud backup is switched on).
 */
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { collection, doc, getDocs, initializeFirestore, writeBatch, type Firestore } from 'firebase/firestore';
import { COLLECTIONS, localDocs, planMerge, planPush, type DocMap } from './model';
import { applyMerge, readSnapshot, readSyncState, writeSyncState } from './local';

export interface SyncResult {
  pulled: number;
  pushed: number;
  at: number;
}

let auth: Auth;
let fs: Firestore;

export function init(config: FirebaseOptions, onUser: (u: User | null) => void): void {
  if (auth) return;
  const app = initializeApp(config);
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
  void getRedirectResult(auth).catch(() => undefined);
  onAuthStateChanged(auth, onUser);
}

/** Popup where it works; full-page redirect inside an installed (standalone) app. */
export async function signIn(standalone: boolean): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (standalone) await signInWithRedirect(auth, provider);
  else await signInWithPopup(auth, provider);
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

async function pullAll(uid: string): Promise<DocMap> {
  const out: DocMap = new Map();
  for (const c of COLLECTIONS) {
    const snap = await getDocs(collection(fs, 'users', uid, c));
    snap.forEach((d) => out.set(`${c}/${d.id}`, d.data()));
  }
  return out;
}

/** Pull + merge, then push what changed. Batches stay under Firestore's 500-write limit. */
export async function syncNow(user: User): Promise<SyncResult> {
  const remote = await pullAll(user.uid);
  const before = await readSnapshot();
  const plan = planMerge(before, remote);
  const pulled = await applyMerge(plan);

  const state = await readSyncState();
  const hashes = { ...state.hashes, ...plan.pulled };
  const after = await readSnapshot();
  const toPush = planPush(localDocs(after), hashes);
  for (let i = 0; i < toPush.length; i += 400) {
    const batch = writeBatch(fs);
    for (const p of toPush.slice(i, i + 400)) {
      const [c, id] = p.path.split('/');
      batch.set(doc(fs, 'users', user.uid, c, id), p.data);
    }
    await batch.commit();
    for (const p of toPush.slice(i, i + 400)) hashes[p.path] = p.hash;
  }
  const at = Date.now();
  await writeSyncState({ uid: user.uid, email: user.email ?? undefined, lastSyncAt: at, hashes });
  return { pulled, pushed: toPush.length, at };
}
