import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

/**
 * api#368: an account an admin creates with `POST /users` has to be able to
 * sign in. Better Auth's email sign-in reads the password off the `credential`
 * row in `accounts` and refuses an unverified email, so `createUser` must write
 * that row, store the email verified, and keep no second copy of the hash on
 * the `users` row.
 */

const db = vi.hoisted(() => ({
  existing: null as unknown,
  created: [] as Array<{ data: Record<string, any> }>,
}));

vi.mock("../src/utils/prisma", () => ({
  connectToPrisma: vi.fn(async () => {}),
  prisma: {
    user: {
      findUnique: vi.fn(async () => db.existing),
      create: vi.fn(async (args: { data: Record<string, any> }) => {
        db.created.push(args);
        return { id: args.data.id, email: args.data.email };
      }),
    },
  },
}));

vi.mock("../src/utils/cache-namespaces", () => ({
  userCache: { invalidateAll: vi.fn(async () => {}) },
}));

import UsersSvc from "../src/modules/users/users.service";

const input = {
  email: "  New.Admin.User@Example.com ",
  username: "newadminuser",
  password: "Str0ng!Passw0rd",
  name: "New Admin User",
};

describe("UsersSvc.createUser (api#368)", () => {
  beforeEach(() => {
    db.existing = null;
    db.created.length = 0;
  });

  it("writes a credential account holding the password hash", async () => {
    await UsersSvc.createUser(input);

    const { data } = db.created[0];
    const account = data.accounts.create;
    expect(account.providerId).toBe("credential");
    // Better Auth's credential accountId is the user's own id.
    expect(data.id).toEqual(expect.any(String));
    expect(account.accountId).toBe(data.id);
    // It is a hash Better Auth's bcrypt verify accepts, not the plain password.
    expect(account.password).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, account.password)).toBe(true);
  });

  it("stores the email verified, so requireEmailVerification lets it in", async () => {
    await UsersSvc.createUser(input);

    expect(db.created[0].data.isEmailVerified).toBe(true);
  });

  it("keeps no second copy of the hash on the users row", async () => {
    await UsersSvc.createUser(input);

    const { data } = db.created[0];
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("passwordHash");
  });

  it("still lowercases the email, since Better Auth looks it up lowercased", async () => {
    await UsersSvc.createUser(input);

    expect(db.created[0].data.email).toBe("new.admin.user@example.com");
  });

  it("refuses an email that is already registered, writing nothing", async () => {
    db.existing = { id: "u1" };

    await expect(UsersSvc.createUser(input)).rejects.toThrow(
      "Email already exists",
    );
    expect(db.created).toHaveLength(0);
  });
});
