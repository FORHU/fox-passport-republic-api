import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    exclude: ["tests/app.spec.ts", "tests/event-template.submit.spec.ts"],
    testTimeout: 15000,
  },
});
