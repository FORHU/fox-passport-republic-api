import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signTestSession } from "./helpers/test-session";

/**
 * #158: the web app's Sync Account replaces its stored user with
 * GET /profile, so the response must carry every field the app keeps
 * (email verified, the Verified badge, location). A missing or expired
 * session answers 401 with `code: REAUTH_REQUIRED`, which is the only case
 * where the app should tell someone to sign in again.
 *
 * Prisma is stubbed; the route, guard, controller, service and repository
 * mapping are real.
 */

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("../src/utils/prisma", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/prisma")>()),
  prisma: { user: { findUnique } },
}));

const { default: app } = await import("../src/app");

const row = {
  id: "sync-user",
  email: "sync@test.local",
  username: "syncer",
  name: "Sync User",
  phone: null,
  imgId: null,
  country: "PH",
  state: "Cebu",
  city: "Cebu City",
  district: "Lahug",
  systemRole: "user",
  roleType: ["eventFoxer"],
  isEmailVerified: true,
  isPrivate: false,
  bio: null,
  socialLinks: null,
  preferredCurrency: "PHP",
  identityVerifiedAt: new Date("2026-11-01T00:00:00.000Z"),
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-11-01T00:00:00.000Z"),
  profile: null,
  settings: null,
  googleId: null,
  // Prisma returns only a credential account that has a password.
  accounts: [{ providerId: "credential" }],
};

function bearer() {
  return `Bearer ${signTestSession({
    userId: "sync-user",
    email: "sync@test.local",
    systemRole: "user",
    roleType: ["eventFoxer"],
  })}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(row);
});

describe("GET /api/v1/profile for Sync Account", () => {
  it("returns the verification and location fields it reads", async () => {
    const res = await request(app)
      .get("/api/v1/profile")
      .set("Authorization", bearer());

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: "sync-user",
      isEmailVerified: true,
      identityVerifiedAt: "2026-11-01T00:00:00.000Z",
      country: "PH",
      state: "Cebu",
      district: "Lahug",
    });
  });

  it("prefers the profile's location over the legacy columns", async () => {
    findUnique.mockResolvedValue({
      ...row,
      profile: {
        phone: null,
        imgId: null,
        city: "Mandaue",
        address: null,
        state: "Bohol",
        country: "US",
        isPrivate: false,
      },
    });

    const res = await request(app)
      .get("/api/v1/profile")
      .set("Authorization", bearer());

    expect(res.body.data).toMatchObject({
      city: "Mandaue",
      state: "Bohol",
      country: "US",
    });
  });

  it("keeps an unverified account unverified", async () => {
    findUnique.mockResolvedValue({
      ...row,
      isEmailVerified: false,
      identityVerifiedAt: null,
    });

    const res = await request(app)
      .get("/api/v1/profile")
      .set("Authorization", bearer());

    expect(res.body.data.isEmailVerified).toBe(false);
    expect(res.body.data.identityVerifiedAt).toBeNull();
  });

  it("says whether account setup is needed (api#419)", async () => {
    const res = await request(app)
      .get("/api/v1/profile")
      .set("Authorization", bearer());

    expect(res.body.data).toMatchObject({
      hasPassword: true,
      needsCredentialSetup: false,
    });
    expect(res.body.data).not.toHaveProperty("accounts");
    expect(res.body.data).not.toHaveProperty("googleId");
  });

  it("reads the sign-in accounts without the password hash (api#419)", async () => {
    await request(app).get("/api/v1/profile").set("Authorization", bearer());

    const accounts = findUnique.mock.calls[0][0].select.accounts;
    expect(accounts.select).toEqual({ providerId: true });
  });

  it("sends a Google account without a password to account setup (api#419)", async () => {
    findUnique.mockResolvedValue({
      ...row,
      accounts: [{ providerId: "google" }],
    });

    const res = await request(app)
      .get("/api/v1/profile")
      .set("Authorization", bearer());

    expect(res.body.data).toMatchObject({
      hasPassword: false,
      needsCredentialSetup: true,
    });
  });

  it("answers 401 REAUTH_REQUIRED without a session", async () => {
    const res = await request(app).get("/api/v1/profile");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      code: "REAUTH_REQUIRED",
    });
  });

  it("answers 401 REAUTH_REQUIRED for a session that isn't valid", async () => {
    const res = await request(app)
      .get("/api/v1/profile")
      .set("Authorization", "Bearer not-a-real-session");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("REAUTH_REQUIRED");
  });
});
