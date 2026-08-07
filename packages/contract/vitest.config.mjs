import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "../../vitest.shared.mjs";

export default defineConfig({
  test: sharedTestConfig({
    include: ["src/**/*.ts"],
    // The contract is the one place every service trusts blindly, so it holds
    // the highest bar in the repo.
    thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
  }),
});
