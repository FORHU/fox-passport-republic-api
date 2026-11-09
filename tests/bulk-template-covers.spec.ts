import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BULK_TEMPLATE_DEFS } from "../prisma/seeder/event.seeder";

/**
 * Every bulk seed package once shared one cover per category, so a search such
 * as Wedding / Cebu showed the same photo on every card. Each package now has
 * its own `cover`, and a data migration applies the same URLs to databases
 * that were seeded before the fix (deploys never re-run the seed).
 */

const root = join(__dirname, "..");
const seederSource = readFileSync(
  join(root, "prisma", "seeder", "event.seeder.ts"),
  "utf-8",
);
const migrationSql = readFileSync(
  join(
    root,
    "prisma",
    "migrations",
    "20261107120000_unique_bulk_template_covers",
    "migration.sql",
  ),
  "utf-8",
);

const UNSPLASH_COVER =
  /^https:\/\/images\.unsplash\.com\/photo-\d+-[0-9a-f]+\?w=800&auto=format&fit=crop$/;

describe("bulk seed package covers", () => {
  it("gives every package its own Unsplash cover", () => {
    const covers = BULK_TEMPLATE_DEFS.map((t) => t.cover);
    expect(covers).toHaveLength(72);
    expect(new Set(covers).size).toBe(covers.length);
    for (const cover of covers) expect(cover).toMatch(UNSPLASH_COVER);
  });

  it("reuses no photo from the hand-picked template images", () => {
    // Each cover appears once in the seeder: in its own entry, nowhere else.
    const reused = BULK_TEMPLATE_DEFS.filter(
      (t) => seederSource.split(t.cover).length - 1 !== 1,
    ).map((t) => t.suffix);
    expect(reused).toEqual([]);
  });

  it("updates the same rows to the same URLs in the data migration", () => {
    const pairs = [
      ...migrationSql.matchAll(/WHEN '([^']+)' THEN '([^']+)'/g),
    ].map((m) => [m[1], m[2]]);
    const expected = BULK_TEMPLATE_DEFS.map((t) => [
      `seed-file-bulk-${t.suffix}-1`,
      t.cover,
    ]);
    expect(pairs).toEqual(expected);

    const whereIds = [
      ...(
        migrationSql.match(/WHERE "id" IN \(([\s\S]*?)\);/)?.[1] ?? ""
      ).matchAll(/'([^']+)'/g),
    ].map((m) => m[1]);
    expect(whereIds).toEqual(expected.map(([id]) => id));
  });
});
