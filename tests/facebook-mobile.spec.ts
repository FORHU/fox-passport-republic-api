import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A Facebook user access token is not something this server minted, so the
 * native flow cannot trust it on sight: a token the user granted to some other
 * Facebook app would otherwise sign them in here. `debug_token` is how the
 * server finds out whose token it is holding.
 */

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: { get: http.get } }));

const repo = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findUserByUsername: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  user: { create: vi.fn(), update: vi.fn() },
}));

vi.mock("../src/modules/auth/auth.repository", () => ({ default: repo }));
vi.mock("../src/utils/prisma", () => ({ prisma: prismaMock }));
vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));
vi.mock("../src/modules/auth/refresh-token.service", () => ({
  issueRefreshToken: vi.fn(async () => "refresh-token"),
  revokeAllForUser: vi.fn(async () => 0),
}));
vi.mock("../src/utils/password", () => ({
  hashPassword: vi.fn(async () => "hashed"),
}));
vi.mock("../src/config", () => ({
  FACEBOOK_APP_ID: "our-app-id",
  FACEBOOK_APP_SECRET: "our-app-secret",
  ACCESS_TOKEN_SECRET: "test-access-secret",
  ACCESS_TOKEN_EXPIRY: "15m",
}));

import FacebookAuthSvc from "../src/modules/auth/facebook-auth.service";

const EXISTING = {
  id: "user-1",
  email: "citizen@example.com",
  username: "citizen",
  name: "Citizen",
  systemRole: "user",
  roleType: [],
  isEmailVerified: true,
};

/** Routes the two Graph API calls the native flow makes. */
function graph(debug: Record<string, unknown>, profile: Record<string, unknown>) {
  http.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/debug_token")) return { data: { data: debug } };
    if (url.endsWith("/me")) return { data: profile };
    throw new Error(`unexpected request: ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findUserByEmail.mockResolvedValue(EXISTING);
  repo.findUserByUsername.mockResolvedValue(null);
});

describe("FacebookAuthSvc.handleAccessToken", () => {
  it("rejects a token issued to a different app", async () => {
    graph({ is_valid: true, app_id: "someone-elses-app" }, { email: EXISTING.email });

    await expect(FacebookAuthSvc.handleAccessToken("tok")).rejects.toThrow(
      /not valid for this app/i,
    );
    // The profile is never even requested for a foreign token.
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it("rejects a token Facebook reports as invalid", async () => {
    graph({ is_valid: false, app_id: "our-app-id" }, { email: EXISTING.email });

    await expect(FacebookAuthSvc.handleAccessToken("tok")).rejects.toThrow(
      /not valid for this app/i,
    );
  });

  it("signs in the existing account for a valid token from this app", async () => {
    graph(
      { is_valid: true, app_id: "our-app-id" },
      { id: "fb-1", email: "Citizen@Example.com", name: "Citizen" },
    );

    const session = await FacebookAuthSvc.handleAccessToken("tok");

    expect(session.user.id).toBe(EXISTING.id);
    expect(session.isNewUser).toBe(false);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBe("refresh-token");
    // Looked up by the normalised address, not the casing Facebook returned.
    expect(repo.findUserByEmail).toHaveBeenCalledWith("citizen@example.com");
  });

  it("asks Facebook to vouch for the token with the app access token", async () => {
    graph(
      { is_valid: true, app_id: "our-app-id" },
      { id: "fb-1", email: EXISTING.email },
    );

    await FacebookAuthSvc.handleAccessToken("user-token");

    const [, debugConfig] = http.get.mock.calls[0];
    expect(debugConfig.params).toEqual({
      input_token: "user-token",
      access_token: "our-app-id|our-app-secret",
    });
  });
});
