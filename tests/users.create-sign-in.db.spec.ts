import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import redisUtil from "../src/utils/redis.util";
import { auth } from "../src/infrastructure/auth/better-auth";

/**
 * api#368 end to end: an admin creates an account with POST /users, and that
 * account signs in through Better Auth with the password it was given.
 *
 * Before the fix the account had no credential row and an unverified email, so
 * sign-in was refused (403 EMAIL_NOT_VERIFIED). Real Postgres and Redis, as
 * profile.credential-setup.db.spec.ts.
 */

const PREFIX = "admincreate.test.";
const stamp = Date.now();
const adminEmail = `${PREFIX}admin.${stamp}@example.com`;
const newEmail = `${PREFIX}new.${stamp}@example.com`;
const newUsername = `admincreate_${stamp}`.slice(0, 30);
const PASSWORD = "Str0ng!Passw0rd#368";

let adminToken = "";
let createdId = "";

async function cleanUp() {
  const where = { user: { email: { startsWith: PREFIX } } };
  await prisma.session.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanUp();
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Admin Creator",
      systemRole: "admin",
      isEmailVerified: true,
    },
  });
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(admin.id);
  adminToken = session.token;
});

afterAll(async () => {
  await cleanUp();
  await redisUtil.disconnect?.();
});

describe("account created by an admin (api#368)", () => {
  it("is created by POST /users", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: newEmail,
        username: newUsername,
        password: PASSWORD,
        name: "Admin Created",
      });

    expect(res.status).toBe(201);
    createdId = res.body.id;
    expect(createdId).toEqual(expect.any(String));
  });

  it("signs in with the password it was given", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: newEmail, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user?.email).toBe(newEmail);
  });

  it("is refused with a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: newEmail, password: `${PASSWORD}x` });

    expect(res.status).toBe(401);
  });

  it("is stored verified, with the hash only on the credential account", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: createdId },
      include: { accounts: true },
      // The client omits the hash from every read unless asked.
      omit: { password: false },
    });

    expect(user.isEmailVerified).toBe(true);
    expect(user.password).toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0]).toMatchObject({
      providerId: "credential",
      accountId: user.id,
    });
    expect(user.accounts[0].password).toEqual(expect.any(String));
  });
});

describe("password changed by an admin (api#368)", () => {
  const NEW_PASSWORD = "An0ther!Passw0rd#368";
  const signIn = (password: string) =>
    request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: newEmail, password });

  it("signs the user out of existing sessions", async () => {
    const ctx = await auth.$context;
    await ctx.internalAdapter.createSession(createdId);
    expect(await prisma.session.count({ where: { userId: createdId } })).toBe(
      2, // the one from the sign-in test above, and this one
    );

    const res = await request(app)
      .put(`/api/v1/users/${createdId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(await prisma.session.count({ where: { userId: createdId } })).toBe(
      0,
    );
  });

  it("signs in with the new password and not the old one", async () => {
    expect((await signIn(NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(PASSWORD)).status).toBe(401);
  });

  it("keeps the hash on the credential account only", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: createdId },
      include: { accounts: true },
      // The client omits the hash from every read unless asked.
      omit: { password: false },
    });

    expect(user.password).toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.accounts).toHaveLength(1);
  });

  it("gives a Google-only user a credential account, so the password works", async () => {
    const googleEmail = `${PREFIX}google.${stamp}@example.com`;
    const google = await prisma.user.create({
      data: { email: googleEmail, name: "Google Only", isEmailVerified: true },
    });
    await prisma.account.create({
      data: {
        userId: google.id,
        providerId: "google",
        accountId: `google-${stamp}`,
      },
    });

    const res = await request(app)
      .put(`/api/v1/users/${google.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: NEW_PASSWORD });
    expect(res.status).toBe(200);

    const signedIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: googleEmail, password: NEW_PASSWORD });
    expect(signedIn.status).toBe(200);
  });
});
