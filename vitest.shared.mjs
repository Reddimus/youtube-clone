/**
 * Shared Vitest settings.
 *
 * Coverage is scoped to each workspace's own `src`/`app` sources so that one
 * workspace's untested files cannot be masked by another's coverage.
 *
 * @param {object} [options]
 * @param {string[]} [options.include] Files counted toward coverage.
 * @param {string[]} [options.exclude] Files excluded from coverage.
 * @param {object} [options.thresholds] Per-metric coverage floors.
 * @param {string} [options.environment] Vitest environment name.
 * @param {string[]} [options.setupFiles] Setup files to run before each suite.
 * @returns {import("vitest/config").ViteUserConfig["test"]}
 */
export function sharedTestConfig({
  include,
  exclude = [],
  thresholds,
  environment = "node",
  setupFiles = [],
} = {}) {
  return {
    environment,
    setupFiles,
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include,
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/node_modules/**",
        ...exclude,
      ],
      thresholds,
    },
  };
}
