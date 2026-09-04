import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    files: ["src/**/*.ts", "prisma/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettierConfig.rules,
      "prettier/prettier": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      // Matching node-postg-backend-template: an error rather than a warning,
      // with `^_` treated as a deliberate discard. `const { status: _rawStatus,
      // ...rest } = data` is the pattern this exists for -- naming a binding
      // only to drop it is correct code, and warning about it teaches people to
      // scroll past warnings, which is how the real ones get missed.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Seeders and preflight print to the console on purpose -- that output is the
  // whole point of a seed run. Mirrors the same relaxation in
  // node-postg-backend-template.
  {
    files: ["prisma/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Tests reach into shapes deliberately: a mock does not have to satisfy the
  // real type to prove the thing under test behaves.
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
