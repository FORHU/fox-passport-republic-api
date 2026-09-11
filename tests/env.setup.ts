import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

/**
 * Runs before any test module is imported, which is the only moment this can
 * work: `src/utils/prisma.ts` builds its pool from `DATABASE_URL` the first
 * time anything imports it, and a spec's own imports are evaluated before its
 * body. Setting the variable from inside a spec would be too late.
 *
 * `.env.test.local` points the suite at a database of its own. It is
 * gitignored, because it holds a connection string; `.env.test.example` is the
 * committed copy. Without it the suite runs against whatever `.env` says, and
 * `tests/setup.ts` refuses to seed - see the note there.
 *
 * `override: true` matters: `src/config.ts` calls `dotenv.config()` on `.env`,
 * and dotenv never overwrites a variable that is already set, so whatever is
 * loaded here wins.
 */
const testEnv = path.resolve(__dirname, "..", ".env.test.local");

if (fs.existsSync(testEnv)) {
  dotenv.config({ path: testEnv, override: true });
}
