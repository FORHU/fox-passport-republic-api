import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";

/**
 * api#235: an email/password account whose email was never verified could
 * sign in forever, and Better Auth refuses to link Google/Facebook to it
 * (`account_not_linked`), so it could never use them. Sign-in now requires a
 * verified email: a refused sign-in is a 403 EMAIL_NOT_VERIFIED and mails a
 * fresh code, which the web and mobile code screens take.
 *
 * Real Postgres and Redis, as auth.session-replace.spec.ts. Mail is mocked.
 */

const sendTemplatedEmail = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => undefined),
);
vi.mock("../src/utils/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/helpers")>()),
  sendTemplatedEmail,
}));

import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";

const PREFIX = "verify-gate.test.";
const PASSWORD = "SuperSecurePassword123!";
const stamp = Date.now();
const email = `${PREFIX}${stamp}@example.com`;

type Mail = {
  template_name: string;
  email_data: { email: string; OTP_CODE: string };
};
const verificationMails = () =>
  sendTemplatedEmail.mock.calls
    .map(([args]) => args as Mail)
    .filter((m) => m.template_name === "verification-email.html");

const signIn = (password = PASSWORD) =>
  request(app).post("/api/auth/sign-in/email").send({ email, password });

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
  for (const match of ["rl:login:*", "rl:register:*", "rl:otp-send:*"]) {
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
});

afterAll(cleanUp);

beforeEach(async () => {
  await clearLimits();
  sendTemplatedEmail.mockClear();
});

describe("sign-in requires a verified email", () => {
  it("sign-up gives no session and mails a verification code", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, password: PASSWORD, name: "Verify Gate" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.isEmailVerified).toBe(false);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    const mails = verificationMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].email_data.email).toBe(email);
    expect(mails[0].email_data.OTP_CODE).toMatch(/^\d{6}$/);
  });

  it("sign-up with a taken email still says so", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, password: PASSWORD, name: "Second Try" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    expect(verificationMails()).toHaveLength(0);
  });

  it("a wrong password is a 401 and mails nothing", async () => {
    const res = await signIn("WrongPassword123!");

    expect(res.status).toBe(401);
    expect(verificationMails()).toHaveLength(0);
  });

  it("the right password on an unverified email is a 403 and mails a fresh code", async () => {
    const res = await signIn();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.body.token).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    const mails = verificationMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].email_data.email).toBe(email);
  });

  it("after verifying with the mailed code, sign-in works", async () => {
    await signIn();
    const [mail] = verificationMails();
    expect(mail).toBeDefined();

    const verify = await request(app)
      .post("/api/auth/email-otp/verify-email")
      .send({ email, otp: mail.email_data.OTP_CODE });
    expect(verify.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.isEmailVerified).toBe(true);

    const res = await signIn();
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });
});
