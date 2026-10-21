import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { ensureCredentialAccount } from "../prisma/seeder/credential-account";
import { hashPassword } from "../src/utils/password";

/**
 * Better Auth's `POST /auth/sign-in/email` reads the `credential` Account row,
 * not `User.password`, and login refuses an unverified email. A seeded user
 * with either missing cannot sign in at all (the partner, organizer and
 * test-scenario seeders used to create exactly that). Pure: no database.
 */

type Row = {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  password: string | null;
};

/** An in-memory stand-in for the `account` delegate. */
function fakeAccounts(initial: Row[] = []) {
  const rows = [...initial];
  let next = rows.length;
  return {
    rows,
    prisma: {
      account: {
        findFirst: async ({
          where,
        }: {
          where: { userId: string; providerId: string };
        }) =>
          rows.find(
            (r) =>
              r.userId === where.userId && r.providerId === where.providerId,
          ) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { password: string };
        }) => {
          const row = rows.find((r) => r.id === where.id)!;
          row.password = data.password;
          return row;
        },
        create: async ({ data }: { data: Omit<Row, "id"> }) => {
          const row = { id: `acc-${++next}`, ...data };
          rows.push(row);
          return row;
        },
      },
      // The helper only needs these three methods of the real delegate.
    } as never,
  };
}

describe("ensureCredentialAccount", () => {
  it("gives a user the credential account Better Auth looks for", async () => {
    const { rows, prisma } = fakeAccounts();

    await ensureCredentialAccount(prisma, "u1", "hash-1");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "u1",
      accountId: "u1",
      providerId: "credential",
      password: "hash-1",
    });
  });

  it("running again updates the password and adds no second account", async () => {
    const { rows, prisma } = fakeAccounts();

    await ensureCredentialAccount(prisma, "u1", "hash-1");
    await ensureCredentialAccount(prisma, "u1", "hash-2");

    expect(rows).toHaveLength(1);
    expect(rows[0].password).toBe("hash-2");
  });

  it("leaves another user's account alone", async () => {
    const { rows, prisma } = fakeAccounts();

    await ensureCredentialAccount(prisma, "u1", "hash-1");
    await ensureCredentialAccount(prisma, "u2", "hash-2");

    expect(rows.map((r) => [r.userId, r.password])).toEqual([
      ["u1", "hash-1"],
      ["u2", "hash-2"],
    ]);
  });

  it("only ever touches the credential provider's row", async () => {
    const google: Row = {
      id: "g1",
      userId: "u1",
      accountId: "google-123",
      providerId: "google",
      password: null,
    };
    const { rows, prisma } = fakeAccounts([google]);

    await ensureCredentialAccount(prisma, "u1", "hash-1");

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.providerId === "google")!.password).toBeNull();
    expect(rows.find((r) => r.providerId === "credential")!.password).toBe(
      "hash-1",
    );
  });

  it("the seed password hash is one Better Auth's verify accepts", async () => {
    // src/infrastructure/auth/better-auth.ts verifies with bcrypt.compare.
    const hash = await hashPassword("Password123!");

    expect(await bcrypt.compare("Password123!", hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });
});

describe("seeders", () => {
  const dir = path.resolve(__dirname, "..", "prisma", "seeder");
  const seeders = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "credential-account.ts")
    .map((f) => ({
      file: f,
      source: fs.readFileSync(path.join(dir, f), "utf8"),
    }));

  const makesUsers = (source: string) =>
    /prisma\.user\.(create|upsert|createMany)\(/.test(source);

  it("finds the seeders that create users", () => {
    // A guard against this test passing because it looked at nothing.
    expect(seeders.filter((s) => makesUsers(s.source)).length).toBeGreaterThan(
      2,
    );
  });

  it("every seeder that creates users also creates their credential account", () => {
    const missing = seeders
      .filter((s) => makesUsers(s.source))
      .filter((s) => !s.source.includes("ensureCredentialAccount("))
      .map((s) => s.file);

    expect(missing).toEqual([]);
  });

  it("every seeded user is marked email-verified", () => {
    const missing = seeders
      .filter((s) => makesUsers(s.source))
      .filter((s) => !s.source.includes("isEmailVerified: true"))
      .map((s) => s.file);

    expect(missing).toEqual([]);
  });

  it("no seeder stores a made-up password hash", () => {
    const fake = seeders
      .filter((s) => /password:\s*"[^"]*hash[^"]*"/i.test(s.source))
      .map((s) => s.file);

    expect(fake).toEqual([]);
  });
});
