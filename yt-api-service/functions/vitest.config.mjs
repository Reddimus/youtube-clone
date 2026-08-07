import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "../../vitest.shared.mjs";

export default defineConfig({
  test: sharedTestConfig({
    include: ["src/**/*.ts"],
    thresholds: { statements: 85, branches: 80, functions: 85, lines: 85 },
  }),
});
