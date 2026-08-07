import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "../vitest.shared.mjs";

export default defineConfig({
  plugins: [react()],
  test: sharedTestConfig({
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Coverage is scoped to the units that unit tests can meaningfully reach.
    include: [
      "app/lib/**/*.ts",
      "app/firebase/**/*.ts",
      "app/components/**/*.tsx",
    ],
    exclude: [
      // Imports `server-only`, so it cannot be loaded in a jsdom worker; it is
      // exercised by the running app and the E2E pass instead.
      "app/lib/videos.ts",
      // A thin adapter over the Firebase SDK with no branching logic of its
      // own. Covering it would only assert that our mocks were called.
      "app/firebase/firebase.ts",
      // Static seed data and a static SVG: no behaviour to exercise.
      "app/lib/demo-data.ts",
      "app/components/brand-mark.tsx",
      // Interaction-heavy client islands: file pickers, XHR upload progress,
      // Firebase popups and media playback are covered end-to-end in a real
      // browser rather than simulated in jsdom.
      "app/components/upload-dialog.tsx",
      "app/components/site-header.tsx",
    ],
    thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
  }),
});
