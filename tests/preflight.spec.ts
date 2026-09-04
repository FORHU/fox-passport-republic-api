import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { $Enums } from "@prisma/client";
import { assertSchemaIsMigrated } from "../prisma/preflight";
import type { Pool } from "pg";

/**
 * The seed's refusal to run against a database that is behind `schema.prisma`.
 *
 * These assert the *behaviour* — what the preflight does when handed a database
 * in a given state — rather than the shape of the query or the wording of the
 * message. The bug this exists for was found by running the thing, not by
 * reading it, and a test that only checked the SQL string would have passed
 * while the check did nothing.
 *
 * Every case builds its rows from `$Enums`, so nothing here carries a copy of
 * the schema that could drift.
 */

/** Every enum value the generated client declares, as `pg_enum` would return. */
function allEnumRows(): { enum_name: string; value: string }[] {
  return Object.entries($Enums).flatMap(([name, values]) =>
    Object.values(values as Record<string, string>).map((value) => ({
      enum_name: name,
      value,
    })),
  );
}

function poolReturning(rows: { enum_name: string; value: string }[]): Pool {
  return { query: vi.fn(async () => ({ rows })) } as unknown as Pool;
}

let exit: ReturnType<typeof vi.spyOn>;
let errors: string[];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((m) => void errors.push(String(m)));
  // The real one ends the process, which would take the test runner with it.
  // Throwing preserves the thing under test: nothing after the refusal runs.
  exit = vi.spyOn(process, "exit").mockImplementation(((): never => {
    throw new Error("__exit__");
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

describe("seed preflight", () => {
  it("lets a fully migrated database through", async () => {
    await expect(
      assertSchemaIsMigrated(poolReturning(allEnumRows())),
    ).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });

  it("refuses when one enum value is missing, and names it", async () => {
    // Exactly the shape of the bug: `add_admin_secretary_role` unapplied, so
    // SystemRole exists but has no `admin_secretary`.
    const rows = allEnumRows().filter(
      (r) => !(r.enum_name === "SystemRole" && r.value === "admin_secretary"),
    );

    await expect(assertSchemaIsMigrated(poolReturning(rows))).rejects.toThrow(
      "__exit__",
    );
    expect(exit).toHaveBeenCalledWith(1);

    const said = errors.join("\n");
    expect(said).toContain("SystemRole");
    expect(said).toContain("admin_secretary");
    // The instruction is the whole reason this check exists — the raw Postgres
    // error already named the enum and the value, and helped nobody.
    expect(said).toMatch(/migrate deploy/);
  });

  it("tells an empty database to create the schema, not to deploy migrations", async () => {
    await expect(assertSchemaIsMigrated(poolReturning([]))).rejects.toThrow(
      "__exit__",
    );

    const said = errors.join("\n");
    expect(said).toContain("no schema");
    expect(said).toContain("migrate dev");
    // `migrate deploy` against a fresh local database is the wrong reflex, so
    // the empty case must not offer it.
    expect(said).not.toMatch(/migrate deploy/);
  });

  it("reports every gap at once rather than the first one", async () => {
    const rows = allEnumRows().filter(
      (r) =>
        !(r.enum_name === "SystemRole" && r.value === "admin_secretary") &&
        !(r.enum_name === "RoleType" && r.value === "investor"),
    );

    await expect(assertSchemaIsMigrated(poolReturning(rows))).rejects.toThrow(
      "__exit__",
    );

    const said = errors.join("\n");
    expect(said).toContain("admin_secretary");
    expect(said).toContain("investor");
  });
});
