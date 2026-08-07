import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { User } from "firebase/auth";
import type { Functions } from "firebase/functions";

import { readFirebaseConfig } from "./config";

export type { User };

let analyticsStarted = false;

function requireBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Firebase client services can only be used in a browser.");
  }
}

export function getFirebaseApp(): FirebaseApp {
  requireBrowser();

  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(
    readFirebaseConfig({
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
        process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    }),
  );
}

/**
 * Loads Analytics on demand.
 *
 * Analytics used to initialize on first paint for every visitor. It is now an
 * explicit, deferred call so it never sits on the critical path and never runs
 * for someone who only came to watch one video.
 */
export async function startAnalytics(): Promise<void> {
  if (analyticsStarted || typeof window === "undefined") {
    return;
  }
  analyticsStarted = true;

  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) {
      getAnalytics(getFirebaseApp());
    }
  } catch {
    // Analytics is optional and must never block authentication or uploads.
  }
}

export async function getFirebaseFunctions(): Promise<Functions> {
  const { getFunctions } = await import("firebase/functions");
  return getFunctions(getFirebaseApp());
}

/**
 * The auth SDK is the single largest Firebase entry point, so every one of
 * these helpers imports it dynamically. Read-only visitors never download it.
 */
export async function signInWithGoogle(): Promise<void> {
  const { GoogleAuthProvider, getAuth, signInWithPopup } =
    await import("firebase/auth");
  await signInWithPopup(getAuth(getFirebaseApp()), new GoogleAuthProvider());
}

export async function signOut(): Promise<void> {
  const { getAuth, signOut: firebaseSignOut } = await import("firebase/auth");
  await firebaseSignOut(getAuth(getFirebaseApp()));
}

/**
 * Subscribes to authentication state.
 *
 * Returns a synchronous unsubscribe so React effects can clean up correctly
 * even if the dynamic import resolves after the component has unmounted.
 */
export function onAuthStateChangedHelper(
  callback: (user: User | null) => void,
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    try {
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      if (cancelled) {
        return;
      }
      unsubscribe = onAuthStateChanged(getAuth(getFirebaseApp()), callback);
    } catch (error) {
      console.error("Authentication state could not be observed.", error);
      callback(null);
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
