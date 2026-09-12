import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    // Points the suite at its own database before any module is imported.
    setupFiles: ["tests/env.setup.ts"],
    testTimeout: 15000,
    // Integration specs share one physical test database and some teardowns
    // are unscoped (`deleteMany({})`, `TRUNCATE ... CASCADE`) rather than
    // filtered to what that file created — see partnership.integration.test.ts
    // and bidding.integration.test.ts. Running files in parallel lets one
    // file's teardown delete rows another file's still-running test depends
    // on ("Event not found", FK violations on unrelated tables). Sequential
    // files avoid the race without rewriting every teardown; see GOTCHAS.md
    // for the established caution around this shared database.
    fileParallelism: false,
  },
});
