import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";

/**
 * app#257: Better Auth's emailOTP answered 200 for an unknown email and sent
 * nothing, so the web showed "We sent a 6-digit code" to an address with no
 * account. The request-reset routes now check the account first: an unknown
 * email is a 404 with a message, and no code is created or mailed.
 *
 * Real Postgres and Redis, as auth.session-replace.spec.ts. Mail is mocked.
 */

const sendTemplatedEmail = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../src/utils/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/helpers")>()),
  sendTemplatedEmail,
}));

import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";
import { NO_ACCOUNT_MESSAGE } from "../src/infrastructure/auth/better-auth";

const PREFIX = "reset-check.test.";
const PASSWORD = "SuperSecurePassword123!";
const stamp = Date.now();
const known = `${PREFIX}known.${stamp}@example.com`;
const unknown = `${PREFIX}nobody.${stamp}@example.test`;

const PATHS = [
  "/api/auth/email-otp/request-password-reset",
  "/api/v1/auth/email-otp/request-password-reset",
  "/api/auth/forget-password/email-otp",
];

const resetCodeFor = (email: string) =>
  prisma.verification.findFirst({
    where: { identifier: { contains: email.toLowerCase() } },
  });

async function cleanUp() {
  const where = { user: { email: { startsWith: PREFIX } } };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.verification.deleteMany({
    where: { identifier: { contains: PREFIX } },
  });
}

async function clearLimits() {
  const redis = redisUtil.getClient();
  if (!redis) return;
  for (const match of ["rl:register:*", "rl:otp-send:*"]) {
    for await (const keys of redis.scanIterator({ MATCH: match })) {
      const batch = Array.isArray(keys) ? keys : [keys];
      if (batch.length) await redis.del(batch);
    }
  }
}

beforeAll(async () => {
  await redisUtil.initialize().catch(() => {});
  await clearLimits();
  await cleanUp();
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({ email: known, password: PASSWORD, name: "Reset Check" });
  expect(res.status).toBe(200);
});

afterAll(cleanUp);

beforeEach(async () => {
  // Each case sends against the same IP and account; keep the send budget
  // (10/hour per IP, 5/hour per account) from deciding the result.
  await clearLimits();
  sendTemplatedEmail.mockClear();
  await prisma.verification.deleteMany({
    where: { identifier: { contains: PREFIX } },
  });
});

describe("requesting a password reset code", () => {
  it.each(PATHS)("%s: an unknown email is a 404 and nothing is sent", async (path) => {
    const res = await request(app).post(path).send({ email: unknown });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NO_ACCOUNT_MESSAGE);
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
    expect(await resetCodeFor(unknown)).toBeNull();
  });

  it.each(PATHS)("%s: a known email gets a code", async (path) => {
    const res = await request(app).post(path).send({ email: known });
    expect(res.status).toBe(200);
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect(sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template_name: "forgot-password.html" }),
    );
  });

  it("matches the account regardless of the email's case", async () => {
    const res = await request(app)
      .post(PATHS[0])
      .send({ email: known.toUpperCase() });
    expect(res.status).toBe(200);
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
  });
});
