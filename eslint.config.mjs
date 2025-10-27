// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import jest from "eslint-plugin-jest";

export default [
  // --- Node/server rules ---
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: [
      "node_modules/",
      "coverage/",
      "totally_not_my_privateKeys.db",
      "test-keys.db"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2024
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-console": "off",
      "eqeqeq": "error",
      "prefer-const": "error",
      "no-var": "error",
      "curly": ["error", "all"],
      "object-shorthand": "error"
    },
  },

  // --- Jest testing overrides ---
  {
    files: ["__tests__/**/*.mjs", "**/*.test.mjs"],
    plugins: { jest },
    languageOptions: {
      globals: {
        ...globals.jest, // Adds beforeAll, test, expect, etc.
      },
    },
    rules: {
      ...jest.configs["flat/recommended"].rules, // Enables recommended Jest rules
    },
  },
];
