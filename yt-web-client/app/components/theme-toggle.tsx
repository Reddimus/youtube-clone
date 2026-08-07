"use client";

import styles from "./theme-toggle.module.css";

const storageKey = "redd-theme";

/**
 * Theme switch with no React state at all.
 *
 * The inline script in the root layout already stamps `data-theme` on <html>
 * before first paint, and CSS decides which icon and label to show from that
 * same attribute. Keeping the current theme out of React removes any chance of
 * a hydration mismatch and any need to set state from an effect.
 */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    const next = current === "dark" ? "light" : "dark";

    root.dataset.theme = next;
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // A blocked storage quota must not break the toggle itself.
    }
  };

  return (
    <button type="button" className={styles.toggle} onClick={toggle}>
      <span className={styles.whenLight}>
        <span className="visuallyHidden">Switch to dark theme</span>
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"
            fill="currentColor"
          />
        </svg>
      </span>

      <span className={styles.whenDark}>
        <span className="visuallyHidden">Switch to light theme</span>
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="4.25" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
          </g>
        </svg>
      </span>
    </button>
  );
}
