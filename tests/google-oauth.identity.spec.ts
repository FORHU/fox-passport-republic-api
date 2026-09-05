import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `handleCallback` decides who you are from the email on Google's ID token: it
 * links the identity to any existing password account with that address, and
 * writes `isEmailVerified: true` on accounts it creates. It shipped without
 * ever reading `email_verified`, so both of those acted on an unproven claim -
 * and on a Workspace domain an administrator can set a user's address to
 * anything. Presenting a victim's address was enough to inherit their account.
 */

const google = vi.hoisted(() => ({
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
  generateAuthUrl: vi.fn(() => "https://accounts.google.com/"),
}));

// A stand-in for the two Redis calls the exchange uses. `getDel` is the one
// that matters: it is what makes a code single-use.
const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    available: { value: true },
    client: {
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      getDel: vi.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: {
    getClient: () => (redis.available.value ? redis.client : null),
  },
}));

const repo = vi.hoisted(() => ({
  findUserByGoogleId: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByUsername: vi.fn(),
  createGoogleUser: vi.fn(),
  linkGoogleId: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    getToken = google.getToken;
    verifyIdToken = google.verifyIdToken;
    generateAuthUrl = google.generateAuthUrl;
  },
}));

vi.mock("../src/modules/auth/auth.repository", () => ({ default: repo }));
vi.mock("../src/modules/auth/refresh-token.service", () => ({
  issueRefreshToken: vi.fn(async () => "refresh-token"),
}));
vi.mock("../src/utils/password", () => ({
  hashPassword: vi.fn(async () => "hashed"),
}));
vi.mock("../src/config", () => ({
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_CALLBACK_URL: "https://api.example.com/api/v1/auth/google/callback",
  ACCESS_TOKEN_SECRET: "test-access-secret",
  ACCESS_TOKEN_EXPIRY: "15m",
}));

import GoogleAuthSvc from "../src/modules/auth/google-auth.service";

/** Google's response for one sign-in, with the verification claim controllable. */
function googleReturns(payload: Record<string, unknown>) {
  google.getToken.mockResolvedValue({ tokens: { id_token: "id-token" } });
  google.verifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

const VICTIM = {
  id: "victim-id",
  email: "victim@example.com",
  username: "victim",
  name: "Victim",
  systemRole: "user",
  roleType: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
  redis.available.value = true;
  repo.findUserByGoogleId.mockResolvedValue(null);
  repo.findUserByEmail.mockResolvedValue(null);
  repo.findUserByUsername.mockResolvedValue(null);
  repo.createGoogleUser.mockImplementation(
    async (data: Record<string, unknown>) => ({
      ...VICTIM,
      ...data,
      id: "new-id",
    }),
  );
  repo.linkGoogleId.mockResolvedValue(VICTIM);
});

describe("unverified Google emails", () => {
  it("refuses to take over an existing account", async () => {
    googleReturns({
      sub: "attacker-google-id",
      email: VICTIM.email,
      email_verified: false,
      name: "Not The Victim",
    });
    repo.findUserByEmail.mockResolvedValue(VICTIM);

    await expect(GoogleAuthSvc.handleCallback("code")).rejects.toThrow(
      /not verified/i,
    );
    expect(repo.linkGoogleId).not.toHaveBeenCalled();
  });

  it("refuses to create an account either", async () => {
    googleReturns({
      sub: "some-google-id",
      email: "nobody@example.com",
      email_verified: false,
    });

    await expect(GoogleAuthSvc.handleCallback("code")).rejects.toThrow(
      /not verified/i,
    );
    expect(repo.createGoogleUser).not.toHaveBeenCalled();
  });

  it("treats a missing claim as unverified rather than as consent", async () => {
    googleReturns({ sub: "some-google-id", email: "nobody@example.com" });

    await expect(GoogleAuthSvc.handleCallback("code")).rejects.toThrow(
      /not verified/i,
    );
    expect(repo.createGoogleUser).not.toHaveBeenCalled();
    expect(repo.linkGoogleId).not.toHaveBeenCalled();
  });
});

describe("verified Google emails", () => {
  it("links the identity to the existing account with that address", async () => {
    googleReturns({
      sub: "google-id",
      email: VICTIM.email,
      email_verified: true,
      name: "Victim",
    });
    repo.findUserByEmail.mockResolvedValue(VICTIM);

    const result = await GoogleAuthSvc.handleCallback("code");

    expect(repo.linkGoogleId).toHaveBeenCalledWith(VICTIM.id, "google-id");
    expect(repo.createGoogleUser).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.accessToken).toBeTruthy();
  });

  it("creates an account when nothing matches", async () => {
    googleReturns({
      sub: "google-id",
      email: "newcomer@example.com",
      email_verified: true,
      name: "Newcomer",
    });

    const result = await GoogleAuthSvc.handleCallback("code");

    expect(repo.createGoogleUser).toHaveBeenCalled();
    expect(result.isNewUser).toBe(true);
  });

  it("returns the existing user without re-linking when the googleId is known", async () => {
    googleReturns({
      sub: "google-id",
      email: VICTIM.email,
      email_verified: true,
    });
    repo.findUserByGoogleId.mockResolvedValue(VICTIM);

    const result = await GoogleAuthSvc.handleCallback("code");

    expect(repo.findUserByEmail).not.toHaveBeenCalled();
    expect(repo.linkGoogleId).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
  });
});

describe("the authorization URL", () => {
  it("carries the state it is given", () => {
    GoogleAuthSvc.getAuthUrl("abc123");
    expect(google.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: "abc123" }),
    );
  });

  it("mints states that differ every time", () => {
    const a = GoogleAuthSvc.createState();
    const b = GoogleAuthSvc.createState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("the exchange code", () => {
  const session = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    isNewUser: false,
  };

  it("round-trips a parked session", async () => {
    const code = await GoogleAuthSvc.stashSession(session);
    expect(await GoogleAuthSvc.redeemSession(code)).toEqual(session);
  });

  it("cannot be redeemed twice", async () => {
    const code = await GoogleAuthSvc.stashSession(session);

    expect(await GoogleAuthSvc.redeemSession(code)).toEqual(session);
    expect(await GoogleAuthSvc.redeemSession(code)).toBeNull();
  });

  it("expires — the stored entry carries a short TTL", async () => {
    await GoogleAuthSvc.stashSession(session);

    expect(redis.client.set).toHaveBeenCalledWith(
      expect.stringContaining("google:exchange:"),
      expect.any(String),
      { EX: 60 },
    );
  });

  it("mints a different code every time", async () => {
    const a = await GoogleAuthSvc.stashSession(session);
    const b = await GoogleAuthSvc.stashSession(session);
    expect(a).not.toBe(b);
  });

  it("returns null for a code that was never issued", async () => {
    expect(await GoogleAuthSvc.redeemSession("never-issued")).toBeNull();
  });

  it("fails closed when the store is unavailable", async () => {
    redis.available.value = false;

    // The alternative to failing here is falling back to putting the tokens in
    // the URL, which is the thing being fixed.
    await expect(GoogleAuthSvc.stashSession(session)).rejects.toThrow(
      /unavailable/i,
    );
  });
});
