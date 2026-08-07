"use client";

import { useEffect } from "react";

import styles from "./message.module.css";

/**
 * Route-level error boundary.
 *
 * There was no boundary anywhere in this app before: a throw inside the
 * header's auth effect — a missing env var, for instance — blanked the entire
 * page with no explanation.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error", error);
  }, [error]);

  return (
    <div className={styles.panel} role="alert">
      <h1 className={styles.title}>Something broke on this page</h1>
      <p className={styles.body}>
        The page could not be rendered. Trying again often clears it; if not,
        check that the Firebase configuration and the video API are reachable.
      </p>
      {error.digest && (
        <p className={styles.detail}>Reference: {error.digest}</p>
      )}
      <button type="button" className={styles.action} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
