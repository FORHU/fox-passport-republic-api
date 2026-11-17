import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";

/**
 * #167 (BUG-22): signing in with an uppercase version of a registered email
 * failed even with the right password. Email is matched without regard to
 * case, on sign-up and on sign-in; the password stays case-sensitive.
 *
 * Real Postgres and Redis, as auth.session-replace.spec.ts.
 */

const PREFIX = "emailcase.test.";
const PASSWORD = "SuperSecurePassword123!";
const stamp = Date.now();
const lower = `${PREFIX}investor.${stamp}@example.com`;
const other = `${PREFIX}other.${stamp}@example.com`;

const signIn = (email: string, password = PASSWORD) =>
  request(app).post("/api/auth/sign-in/email").send({ email, password });

async function cleanUp() {
  const where = {
    user: { email: { startsWith: PREFIX, mode: "insensitive" as const } },
  };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({
    where: { email: { startsWith: PREFIX, mode: "insensitive" } },
  });
}

beforeAll(async () => {
  await redisUtil.initialize().catch(() => {});
  const redis = redisUtil.getClient();
  if (redis) {
    for (const match of ["rl:login:*", "rl:register:*"]) {
      for await (const keys of redis.scanIterator({ MATCH: match })) {
        const batch = Array.isArray(keys) ? keys : [keys];
        if (batch.length) await redis.del(batch);
      }
    }
  }
  await cleanUp();
  for (const [email, name] of [
    [lower, "Ivy Investor"],
    [other, "Otto Other"],
  ]) {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, password: PASSWORD, name });
    expect(res.status).toBe(200);
  }
  await prisma.user.updateMany({
    where: { email: { in: [lower, other] } },
    data: { isEmailVerified: true },
  });
}, 60_000);

afterAll(cleanUp);

describe("email casing on sign-in", () => {
  it("signs in with the email exactly as registered", async () => {
    expect((await signIn(lower)).status).toBe(200);
  });

  it("signs in with the email in uppercase", async () => {
    expect((await signIn(lower.toUpperCase())).status).toBe(200);
  });

  it("signs in with the email in mixed case", async () => {
    const mixed = lower
      .replace("investor", "InVeStOr")
      .replace("example", "Example");
    expect((await signIn(mixed)).status).toBe(200);
  });

  it("keeps the password case-sensitive", async () => {
    expect(
      (await signIn(lower.toUpperCase(), PASSWORD.toUpperCase())).status,
    ).toBe(401);
  });

  it("signs in as the account the email names, never another", async () => {
    const res = await signIn(lower.toUpperCase());
    expect(res.body.user.email).toBe(lower);
    expect(res.body.user.email).not.toBe(other);
  });
});

describe("sign-up with an email that differs only by case", () => {
  it("does not create a second account", async () => {
    await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email: lower.toUpperCase(), password: PASSWORD, name: "Dup" });
    const rows = await prisma.user.findMany({
      where: { email: { equals: lower, mode: "insensitive" } },
    });
    expect(rows).toHaveLength(1);
  });
});

describe("an account whose stored email is not lowercase", () => {
  // Better Auth looks the email up in lowercase, so a row stored with capitals
  // (imported, or written by an older path) could never be found.
  const legacyLower = `${PREFIX}legacy.${stamp}@example.com`;
  const legacyStored = `${PREFIX}Legacy.${stamp}@Example.com`;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email: legacyLower, password: PASSWORD, name: "Lee Legacy" });
    expect(res.status).toBe(200);
    await prisma.user.update({
      where: { email: legacyLower },
      data: { email: legacyStored, isEmailVerified: true },
    });
  }, 60_000);

  // Two accounts whose emails differ only by case: the lowercase one is taken.
  const takenLower = `${PREFIX}taken.${stamp}@example.com`;
  const takenOther = `${PREFIX}taken2.${stamp}@example.com`;
  const takenClash = `${PREFIX}Taken.${stamp}@example.com`;

  const migration = readFileSync(
    join(
      __dirname,
      "../prisma/migrations/20261116100000_lowercase_user_emails/migration.sql",
    ),
    "utf8",
  );

  beforeAll(async () => {
    for (const [email, name] of [
      [takenLower, "Tess Taken"],
      [takenOther, "Tom Taken"],
    ]) {
      const res = await request(app)
        .post("/api/auth/sign-up/email")
        .send({ email, password: PASSWORD, name });
      expect(res.status).toBe(200);
    }
    await prisma.user.update({
      where: { email: takenOther },
      data: { email: takenClash, isEmailVerified: true },
    });
  }, 60_000);

  it("cannot sign in before the migration, in any casing", async () => {
    expect((await signIn(legacyLower)).status).toBe(401);
    expect((await signIn(legacyStored)).status).toBe(401);
  });

  it("signs in once the migration has lowercased the email", async () => {
    await prisma.$executeRawUnsafe(migration);
    const row = await prisma.user.findFirst({
      where: { email: { equals: legacyLower, mode: "insensitive" } },
    });
    expect(row?.email).toBe(legacyLower);
    expect((await signIn(legacyLower)).status).toBe(200);
    expect((await signIn(legacyStored)).status).toBe(200);
  });

  it("leaves a row alone when another account holds its lowercase form", async () => {
    const [kept, clash] = await Promise.all([
      prisma.user.findUnique({ where: { email: takenLower } }),
      prisma.user.findUnique({ where: { email: takenClash } }),
    ]);
    expect(kept).not.toBeNull();
    expect(clash).not.toBeNull();
    expect(kept?.id).not.toBe(clash?.id);
  });
});
