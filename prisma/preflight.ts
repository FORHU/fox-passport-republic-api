import { $Enums } from "@prisma/client";
import type { Pool } from "pg";

/**
 * Does the database actually know every enum value the seed is about to write?
 *
 * Twice now the answer has been no, and both times it cost an hour.
 * `add_admin_secretary_role` had never been applied locally, so the Postgres
 * `SystemRole` enum had no `admin_secretary`. The seed does not discover this
 * up front — `secretary@example.com` is the *second* of about 150 users, so
 * `admin@example.com` is already committed when Postgres rejects the insert
 * with:
 *
 *     invalid input value for enum "SystemRole": "admin_secretary"
 *
 * That message is true and almost useless. It names a value the schema plainly
 * declares, from inside a loop, against a database left half-seeded — and
 * nothing in it says "you have an unapplied migration", which is the only thing
 * the reader needs to know.
 *
 * So: compare the enums in the generated client against the enums in the
 * database, before anything is written. The generated client is regenerated
 * from `schema.prisma` on every `prisma generate`, so this check has no list of
 * its own to drift out of date — it covers all 27 enums, and any future
 * migration that adds a value is covered the day it is written.
 *
 * Scope is deliberately just enums. A migration that adds a *table* or a
 * *column* already fails with Postgres naming the missing relation, which is a
 * diagnosis on its own. The enum case is the one that misleads.
 */

/** An enum the client declares and the database does not fully have. */
interface EnumGap {
  name: string;
  missing: string[];
}

/**
 * Every enum type in the database, as `name -> values`.
 *
 * Namespaces other than the system ones are all included rather than filtering
 * on `current_schema()`: if a deployment ever puts the models somewhere other
 * than `public`, a preflight that silently found nothing would be worse than
 * one that looked slightly too widely.
 */
async function readDatabaseEnums(
  pool: Pool,
): Promise<Map<string, Set<string>>> {
  const { rows } = await pool.query<{ enum_name: string; value: string }>(`
    SELECT t.typname AS enum_name, e.enumlabel AS value
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  `);

  const found = new Map<string, Set<string>>();
  for (const { enum_name, value } of rows) {
    let values = found.get(enum_name);
    if (!values) {
      values = new Set<string>();
      found.set(enum_name, values);
    }
    values.add(value);
  }
  return found;
}

/**
 * Refuses to seed if the database is behind `schema.prisma` on any enum.
 *
 * Exits rather than throwing. The caller has not written anything yet, so there
 * is nothing to unwind, and a stack trace would bury the one instruction that
 * matters.
 */
export async function assertSchemaIsMigrated(pool: Pool): Promise<void> {
  const inDatabase = await readDatabaseEnums(pool);

  const gaps: EnumGap[] = [];
  for (const [name, values] of Object.entries($Enums)) {
    const present = inDatabase.get(name);
    const missing = Object.values(values as Record<string, string>).filter(
      (v) => !present?.has(v),
    );
    if (missing.length > 0) gaps.push({ name, missing });
  }

  if (gaps.length === 0) return;

  // Every enum missing entirely is a different situation from one enum missing
  // one value, and it deserves a different instruction: this is an empty
  // database, not a stale one, and `migrate deploy` on a fresh database is the
  // wrong reflex locally.
  const nothingApplied = gaps.length === Object.keys($Enums).length;

  if (nothingApplied) {
    console.error(
      "\n❌ Refusing to seed: this database has no schema.\n\n" +
        `   None of the ${gaps.length} enums in schema.prisma exist in it, so no\n` +
        "   migration has ever been applied here.\n\n" +
        "   Create the schema first:  pnpm exec prisma migrate dev\n",
    );
    process.exit(1);
  }

  const detail = gaps
    .map((g) => `     • ${g.name} is missing: ${g.missing.join(", ")}`)
    .join("\n");

  console.error(
    "\n❌ Refusing to seed: the database is behind schema.prisma.\n\n" +
      "   These enum values exist in the schema but not in the database, which\n" +
      "   means a migration has not been applied here:\n\n" +
      detail +
      "\n\n" +
      "   Apply it, then seed again:\n" +
      "     pnpm exec prisma migrate dev     (local, creates missing migrations)\n" +
      "     pnpm exec prisma migrate deploy  (anywhere else, applies existing ones)\n\n" +
      "   Seeding now would fail partway through and leave the database half\n" +
      "   populated, which is how this was found the first two times.\n",
  );
  process.exit(1);
}
