module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "plugin:prettier/recommended",
    "prettier",
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript", // Add this to use the TypeScript configuration
  ],
  plugins: ["@typescript-eslint", "import", "simple-import-sort"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "tsconfig.json",
  },
  env: {
    es6: true,
    node: true,
  },
  rules: {
    "no-var": "error",
    indent: ["error", 2],
    "no-multi-spaces": "error",
    "space-in-parens": "error",
    "no-multiple-empty-lines": "error",
    "prefer-const": "error",
    "prettier/prettier": [
      "error",
      {
        endOfLine: "auto",
      },
    ],
    "import/no-unresolved": "error",
    "import/named": "error",
    "import/default": "error",
    "import/namespace": "error",
    "import/no-duplicates": "error",
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
  },
};
