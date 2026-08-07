import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  eslintConfigPrettier,
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts", "public/**"]),
]);
