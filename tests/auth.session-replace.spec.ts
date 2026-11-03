import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";

/**
 * #142 (BUG-07): signing in as a second user without logging out first left
 * the first user's session valid for its full seven days. A sign-in now
 * replaces the session the request arrived with, whether that came as the
 * cookie (web) or `Authorization: Bearer` (mobile, the web proxy).
 *
 * Real Postgres and Redis, as better-auth.brute.spec.ts.
 */

const PREFIX = "replace.test.";
const PASSWORD = "SuperSecurePassword123!";
const stamp = Date.now();
const emailA = `${PREFIX}a.${stamp}@example.com`;
const emailB = `${PREFIX}b.${stamp}@example.com`;

const signIn = (email: string, password = PASSWORD) =>
  request(app).post("/api/auth/sign-in/email").send({ email, password });
const profileWith = (token: string) =>
  request(app).get("/api/v1/profile").set("Authorization", `Bearer ${token}`);
const sessionExists = async (token: string) =>
  Boolean(await prisma.session.findUnique({ where: { token } }));

async function cleanUp() {
  const where = { user: { email: { startsWith: PREFIX } } };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  // The sign-in and sign-up limits key on 127.0.0.1 for every run; start from
  // zero so an earlier local run cannot lock this one out.
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
    [emailA, "Alice Replace"],
    [emailB, "Bea Replace"],
  ]) {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, password: PASSWORD, name });
    expect(res.status).toBe(200);
  }
});

afterAll(cleanUp);

describe("signing in over another account's session", () => {
  it("over the cookie: the session is B's, and A's is revoked", async () => {
    const a = await signIn(emailA);
    expect(a.status).toBe(200);
    const aCookie = a.headers["set-cookie"] as unknown as string[];

    const b = await signIn(emailB).set("Cookie", aCookie);
    expect(b.status).toBe(200);
    const bCookie = b.headers["set-cookie"] as unknown as string[];

    const session = await request(app)
      .get("/api/auth/get-session")
      .set("Cookie", bCookie);
    expect(session.body.user.email).toBe(emailB);

    expect(await sessionExists(a.body.token)).toBe(false);
    expect((await profileWith(a.body.token)).status).toBe(401);
    const asB = await profileWith(b.body.token);
    expect(asB.status).toBe(200);
    expect(asB.body.data.email).toBe(emailB);
  });

  it("over a Bearer token (mobile, the web proxy): the same", async () => {
    const a = await signIn(emailA);
    const b = await signIn(emailB).set(
      "Authorization",
      `Bearer ${a.body.token}`,
    );
    expect(b.status).toBe(200);

    expect(await sessionExists(a.body.token)).toBe(false);
    expect((await profileWith(a.body.token)).status).toBe(401);
    expect((await profileWith(b.body.token)).body.data.email).toBe(emailB);
  });

  it("a failed sign-in signs nobody out", async () => {
    const a = await signIn(emailA);
    const aCookie = a.headers["set-cookie"] as unknown as string[];

    const wrong = await signIn(emailB, "not-the-password").set(
      "Cookie",
      aCookie,
    );
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    expect(await sessionExists(a.body.token)).toBe(true);
    expect((await profileWith(a.body.token)).body.data.email).toBe(emailA);
  });

  it("reading the session keeps it: only a new session replaces one", async () => {
    const a = await signIn(emailA);
    await request(app)
      .get("/api/auth/get-session")
      .set("Authorization", `Bearer ${a.body.token}`);
    expect(await sessionExists(a.body.token)).toBe(true);
  });
});
