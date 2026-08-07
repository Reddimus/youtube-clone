"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  onAuthStateChangedHelper,
  signInWithGoogle,
  signOut,
  startAnalytics,
  type User,
} from "../firebase/firebase";
import { isDemoMode } from "../lib/runtime";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { useToast } from "./toast";
import { UploadDialog } from "./upload-dialog";
import styles from "./site-header.module.css";

/** `undefined` means auth has not resolved yet, which is not the same as signed out. */
type AuthState = User | null | undefined;

export function SiteHeader() {
  const demo = isDemoMode();
  // In demo mode there is no Firebase project, so auth is resolved up front
  // as "signed out" rather than being settled later from an effect.
  const [user, setUser] = useState<AuthState>(demo ? null : undefined);
  const [busy, setBusy] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    if (demo) {
      return;
    }

    return onAuthStateChangedHelper(setUser);
  }, [demo]);

  useEffect(() => {
    if (demo) {
      return;
    }
    // Deferred to idle so analytics never competes with the first paint.
    const handle = window.requestIdleCallback?.(() => void startAnalytics());
    return () => {
      if (handle !== undefined) {
        window.cancelIdleCallback?.(handle);
      }
    };
  }, [demo]);

  const handleAuth = async () => {
    setBusy(true);
    try {
      if (user) {
        await signOut();
        notify("Signed out.", "info");
      } else {
        await signInWithGoogle();
      }
    } catch (error) {
      // A closed popup is the user changing their mind, not a failure worth
      // reporting. Everything else is.
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (
        code !== "auth/popup-closed-by-user" &&
        code !== "auth/cancelled-popup-request"
      ) {
        notify(
          code === "auth/popup-blocked"
            ? "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
            : "Sign-in did not complete. Try again.",
          "error",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <BrandMark className={styles.mark} />
          <span className={styles.wordmark}>Redd</span>
        </Link>

        <div className={styles.actions}>
          {!demo && user && <UploadDialog />}
          <ThemeToggle />

          {demo ? (
            <span className={styles.demoChip}>
              Demo mode
              <span className="visuallyHidden">
                — sign-in and uploads are disabled because no Firebase project
                is configured
              </span>
            </span>
          ) : user === undefined ? (
            <span className={styles.authSkeleton} aria-hidden="true" />
          ) : (
            <div className={styles.authGroup}>
              {user && (
                <span
                  className={styles.identity}
                  title={user.email ?? undefined}
                >
                  {user.displayName ?? user.email ?? "Signed in"}
                </span>
              )}
              <button
                type="button"
                className={styles.authButton}
                onClick={() => void handleAuth()}
                disabled={busy}
              >
                {busy ? "Working…" : user ? "Sign out" : "Sign in"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
