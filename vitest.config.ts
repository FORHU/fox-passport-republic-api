import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    // Points the suite at its own database before any module is imported.
    setupFiles: ["tests/env.setup.ts"],
    testTimeout: 15000,
  },
});
