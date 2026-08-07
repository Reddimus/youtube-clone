import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "../vitest.shared.mjs";

export default defineConfig({
  test: sharedTestConfig({
    include: ["src/**/*.ts"],
    // index.ts is the process bootstrap: it binds a port and wires real
    // implementations together, which the container smoke test covers instead.
    exclude: ["src/index.ts"],
    thresholds: { statements: 85, branches: 80, functions: 85, lines: 85 },
  }),
});
