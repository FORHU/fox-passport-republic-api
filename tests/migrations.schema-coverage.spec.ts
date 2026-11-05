import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every table and enum value the Prisma schema declares must be created by
 * some migration. #230 added `ProviderFoxerApplication` and the
 * `providerFoxer` role to the schema with no migration, so any database built
 * from migrations lacked the table and every role-request query 500'd (P2021)
 * - the admin "Role applications" list among them. The generated client and
 * `tsc` were both happy; only a real database noticed.
 *
 * A source scan rather than a database check, so it runs everywhere; `prisma
 * migrate diff` against a real database is the stronger check where one exists.
 */

const root = join(__dirname, "..");
const schemaDir = join(root, "prisma", "schema");
const migrationsDir = join(root, "prisma", "migrations");

const schema = readdirSync(schemaDir)
  .filter((f) => f.endsWith(".prisma"))
  .map((f) => readFileSync(join(schemaDir, f), "utf-8"))
  .join("\n");

const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    try {
      return readFileSync(
        join(migrationsDir, d.name, "migration.sql"),
        "utf-8",
      );
    } catch {
      return "";
    }
  })
  .join("\n");

/** `model X { ... @@map("table") }` -> table name (or the model name unmapped). */
function schemaTables(): string[] {
  const tables: string[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const mapped = m[2].match(/@@map\("([^"]+)"\)/);
    tables.push(mapped ? mapped[1] : m[1]);
  }
  return tables;
}

/** `enum X { a b }` -> [X, [a, b]] */
function schemaEnums(): [string, string[]][] {
  const enums: [string, string[]][] = [];
  for (const m of schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const values = m[2]
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter((l) => /^\w+$/.test(l));
    enums.push([m[1], values]);
  }
  return enums;
}

/** A table is created directly or reached by a rename. */
function tableCreated(table: string): boolean {
  const q = `"${table}"`;
  return (
    migrations.includes(`CREATE TABLE ${q}`) ||
    migrations.includes(`CREATE TABLE IF NOT EXISTS ${q}`) ||
    // Table names are plain identifiers, so they need no regex escaping.
    new RegExp(`RENAME TO\\s+${q}`).test(migrations)
  );
}

describe("every schema object has a migration", () => {
  it("creates every table", () => {
    const missing = schemaTables().filter((t) => !tableCreated(t));
    expect(
      missing,
      "tables in prisma/schema with no CREATE TABLE in prisma/migrations",
    ).toEqual([]);
  });

  it("creates every enum value", () => {
    const missing: string[] = [];
    for (const [name, values] of schemaEnums()) {
      for (const v of values) {
        if (!migrations.includes(`'${v}'`)) missing.push(`${name}.${v}`);
      }
    }
    expect(
      missing,
      "enum values in prisma/schema never added by a migration",
    ).toEqual([]);
  });

  it("includes the provider Foxer role and its application table", () => {
    expect(tableCreated("provider_foxer_applications")).toBe(true);
    expect(migrations).toMatch(
      /ALTER TYPE "RoleType" ADD VALUE[^;]*'providerFoxer'/,
    );
    expect(migrations).toMatch(
      /ALTER TYPE "UserPath" ADD VALUE[^;]*'providerFoxer'/,
    );
  });
});
