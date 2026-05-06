import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import unusedImports from "eslint-plugin-unused-imports";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "coverage"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-console": "off",
      "unused-imports/no-unused-imports": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]);
