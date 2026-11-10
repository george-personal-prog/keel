/**
 * Firebase web configuration for the owner's project.
 *
 * These values are public identifiers, not secrets: every Firebase web app ships them to the
 * browser. Access is protected by Google sign-in plus the Firestore rules in `firestore.rules`
 * (each signed-in user can only read and write their own `users/{uid}` tree).
 *
 * null = cloud backup not set up yet; the app works fully without it.
 */
import type { FirebaseOptions } from 'firebase/app';

export const FIREBASE_CONFIG: FirebaseOptions | null = null;
