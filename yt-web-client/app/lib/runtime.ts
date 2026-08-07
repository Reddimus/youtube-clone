/**
 * Runtime mode detection.
 *
 * Redd is an offline prototype, so it has to be useful with no cloud account
 * at all. Demo mode serves a seeded feed and sample media straight out of
 * `public/`, which makes `npm install && npm run dev` a complete experience.
 *
 * It turns on explicitly via `NEXT_PUBLIC_DEMO_MODE`, and implicitly whenever
 * no Firebase project is configured — so a fresh clone never crashes on
 * missing environment variables.
 */
export function isDemoMode(): boolean {
  const explicit = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }

  return !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
}

/** Where processed media is served from in demo mode. */
export const demoMediaBase = "/samples";
