import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * Shared lint rules for every TypeScript workspace.
 *
 * `projectService` lets typescript-eslint locate the nearest tsconfig itself, so
 * each workspace no longer has to hand-maintain a `project` path.
 *
 * @param {object} [options]
 * @param {string[]} [options.ignores] Extra glob patterns to ignore.
 * @returns {import("eslint").Linter.Config[]}
 */
export function createTypeScriptConfig({ ignores = [] } = {}) {
  return tseslint.config(
    {
      ignores: ["**/dist/**", "**/lib/**", "**/coverage/**", ...ignores],
    },
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "no-console": ["warn", { allow: ["warn", "error", "info"] }],
        eqeqeq: ["error", "always", { null: "ignore" }],
      },
    },
    {
      // Config files sit outside every tsconfig `include`, so type-aware rules
      // have no program to consult. Lint them syntactically instead.
      files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        parserOptions: { projectService: false, project: false },
      },
    },
    {
      // Tests exercise deliberately malformed input, so the strictness that
      // protects production code only gets in the way here.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "no-console": "off",
      },
    },
    eslintConfigPrettier,
  );
}
