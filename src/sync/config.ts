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

export const FIREBASE_CONFIG: FirebaseOptions | null = {
  apiKey: 'AIzaSyDfKhtQYUBMP-kTbgSXeRdeGWWXAd3S0DI',
  authDomain: 'keel-77ab9.firebaseapp.com',
  projectId: 'keel-77ab9',
  storageBucket: 'keel-77ab9.firebasestorage.app',
  messagingSenderId: '14501089130',
  appId: '1:14501089130:web:7acb9637c2ac615bc21f13',
};

/** The address to install the iPhone app from (same domain as the sign-in handler). */
export const APP_URL = 'https://keel-77ab9.firebaseapp.com';
