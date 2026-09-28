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

/**
 * Never let the suite touch a database whose name doesn't end in `_test`.
 *
 * `tests/setup.ts` guards only the specs that import it, and several that
 * don't tear down unscoped — `bidding.http.spec.ts` ends with
 * `TRUNCATE TABLE "users" CASCADE`, which empties every user and everything
 * hanging off one. With no `.env.test.local`, the suite used to fall back to
 * `.env`'s development database and did exactly that to it (24 Sep 2026, once
 * per full run). So the fallback is gone: without a test database named here,
 * the suite points at `<dev database>_test` instead. If that database doesn't
 * exist the database-backed specs fail to connect — loudly, and harmlessly —
 * rather than wiping real data. Unit specs that mock Prisma are unaffected.
 */
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const url = process.env.DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    parsed.pathname = `/${name}_test`;
    process.env.DATABASE_URL = parsed.toString();
    console.warn(
      `[tests] DATABASE_URL pointed at "${name}", not a test database — ` +
        `using "${name}_test" instead. Create it (see tests/setup.ts) and ` +
        "put its URL in .env.test.local.",
    );
  }
}
