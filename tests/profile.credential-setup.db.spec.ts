import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";
import { auth } from "../src/infrastructure/auth/better-auth";

/**
 * api#419 end to end: a Google-only account, on a real Better Auth session,
 * sets its username and password through POST /profile/credentials, and can
 * then sign in with its email and that password. The password lands on the
 * credential account as a hash, and setup can't run twice.
 *
 * Real Postgres and Redis, as auth.email-case.spec.ts.
 */

const PREFIX = "credsetup.test.";
const stamp = Date.now();
const email = `${PREFIX}${stamp}@example.com`;
const username = `credsetup_${stamp}`.slice(0, 30);
const PASSWORD = "Str0ng!Passw0rd#419";

let userId = "";
let token = "";

async function cleanUp() {
  const where = { user: { email: { startsWith: PREFIX } } };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanUp();
  const user = await prisma.user.create({
    data: { email, name: "Google Person", isEmailVerified: true },
  });
  userId = user.id;
  await prisma.account.create({
    data: {
      userId,
      providerId: "google",
      accountId: `google-${stamp}`,
    },
  });
  // The session Better Auth would have made at the Google callback.
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  token = session.token;
});

afterAll(async () => {
  await cleanUp();
  await redisUtil.disconnect?.();
});

const asUser = (req: request.Test) =>
  req.set("Authorization", `Bearer ${token}`);

describe("Google account setup (api#419)", () => {
  it("is asked to set up before anything else", async () => {
    const res = await asUser(request(app).get("/api/v1/profile"));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      username: null,
      hasPassword: false,
      needsCredentialSetup: true,
    });
  });

  it("sees its chosen username as available", async () => {
    const res = await asUser(
      request(app).get(`/api/v1/profile/username-availability`),
    ).query({ username });
    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
  });

  it("sets the username and the password", async () => {
    const res = await asUser(
      request(app).post("/api/v1/profile/credentials"),
    ).send({ username, password: PASSWORD, confirmPassword: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      username,
      hasPassword: true,
      needsCredentialSetup: false,
    });

    const credential = await prisma.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { password: true },
    });
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toBe(PASSWORD);
    expect(credential?.password).toMatch(/^\$2[aby]\$12\$/);
  });

  it("keeps its session after setup", async () => {
    const res = await asUser(request(app).get("/api/v1/profile"));
    expect(res.status).toBe(200);
    expect(res.body.data.needsCredentialSetup).toBe(false);
  });

  it("can now sign in with its email and the new password", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe(userId);
  });

  it("can't run setup again to replace the password", async () => {
    const res = await asUser(
      request(app).post("/api/v1/profile/credentials"),
    ).send({
      password: "An0ther!Passw0rd",
      confirmPassword: "An0ther!Passw0rd",
    });
    expect(res.status).toBe(409);

    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: PASSWORD });
    expect(signIn.status).toBe(200);
  });
});
