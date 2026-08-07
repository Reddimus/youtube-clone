import { getAnalytics, isSupported } from "firebase/analytics";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFunctions, type Functions } from "firebase/functions";

import { readFirebaseConfig } from "./config";

let analyticsInitializationStarted = false;

function requireBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Firebase client services can only be used in a browser.");
  }
}

function startAnalytics(app: FirebaseApp): void {
  if (analyticsInitializationStarted) {
    return;
  }

  analyticsInitializationStarted = true;
  void isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics is optional and must not prevent authentication or uploads.
    });
}

function getFirebaseApp(): FirebaseApp {
  requireBrowser();

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp(
          readFirebaseConfig({
            NEXT_PUBLIC_FIREBASE_API_KEY:
              process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
              process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            NEXT_PUBLIC_FIREBASE_PROJECT_ID:
              process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            NEXT_PUBLIC_FIREBASE_APP_ID:
              process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
              process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
          }),
        );

  startAnalytics(app);
  return app;
}

export function getFirebaseFunctions(): Functions {
  return getFunctions(getFirebaseApp());
}

/** Signs the user in with a Google popup. */
export function signInWithGoogle() {
  return signInWithPopup(getAuth(getFirebaseApp()), new GoogleAuthProvider());
}

/** Signs the current user out. */
export function signOut() {
  return firebaseSignOut(getAuth(getFirebaseApp()));
}

/** Subscribes to browser authentication state changes. */
export function onAuthStateChangedHelper(
  callback: (user: User | null) => void,
) {
  return onAuthStateChanged(getAuth(getFirebaseApp()), callback);
}
