import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { APIError } from "better-auth/api";

/**
 * api#419: a Google account must have a username and a password before it
 * uses the app. GET /profile says whether setup is needed, and
 * POST /profile/credentials sets what is missing: the username first, then
 * the password through Better Auth's setPassword on the caller's session.
 * A password already set is never replaced here. Repositories and Better Auth
 * are stubbed; the rules and validation are real.
 */

const repo = vi.hoisted(() => ({
  findProfileById: vi.fn(),
  findCredentialState: vi.fn(),
  findByUsernameExcludingUserId: vi.fn(),
  updateProfile: vi.fn(async () => ({ id: "u1" })),
  findRoleTypes: vi.fn(async () => []),
}));
vi.mock("../src/modules/profile/profile.repository", () => ({
  default: repo,
}));
const setPassword = vi.hoisted(() => vi.fn(async () => ({ status: true })));
vi.mock("../src/infrastructure/auth/better-auth", () => ({
  auth: { api: { setPassword } },
}));
const syncDetectedSteps = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../src/modules/onboarding/onboarding.service", () => ({
  default: { syncDetectedSteps },
}));
vi.mock("../src/modules/auth/sessions.service", () => ({
  revokeAllSessions: vi.fn(),
}));
vi.mock("../src/modules/audit/audit.service", () => ({
  recordChange: vi.fn(),
}));
vi.mock("../src/modules/fx/fx.service", () => ({
  SUPPORTED_CURRENCIES: ["PHP", "USD"],
}));
vi.mock("../src/utils/prisma", () => ({ prisma: {} }));

const {
  default: ProfileSvc,
  needsCredentialSetup,
  CREDENTIALS_ALREADY_SET,
  PASSWORD_ALREADY_SET,
  USERNAME_TAKEN,
} = await import("../src/modules/profile/profile.service");
const { default: ProfileCtrl } =
  await import("../src/modules/profile/profile.controller");

const GOOD_PASSWORD = "Str0ng!Passw0rd";
const headers = { cookie: "better-auth.session_token=abc" };

const googleOnly = { username: null, hasGoogle: true, hasPassword: false };
const profileRow = (credentials: object) => ({
  id: "u1",
  username: "new.name",
  systemRole: "user",
  roleType: [],
  credentials,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByUsernameExcludingUserId.mockResolvedValue(null);
  repo.findProfileById.mockResolvedValue(
    profileRow({ username: "new.name", hasGoogle: true, hasPassword: true }),
  );
});

describe("needsCredentialSetup", () => {
  it.each([
    ["Google, nothing set", googleOnly, true],
    ["Google, username only", { ...googleOnly, username: "a.b" }, true],
    ["Google, password only", { ...googleOnly, hasPassword: true }, true],
    [
      "Google, both set",
      { username: "a.b", hasGoogle: true, hasPassword: true },
      false,
    ],
    [
      "email account without a username",
      { username: null, hasGoogle: false, hasPassword: true },
      false,
    ],
    [
      "Facebook-only account",
      { username: null, hasGoogle: false, hasPassword: false },
      false,
    ],
  ])("%s → %s", (_label, state, expected) => {
    expect(needsCredentialSetup(state)).toBe(expected);
  });
});

describe("GET /profile setup fields", () => {
  it("tells a Google account without a password to set up", async () => {
    repo.findProfileById.mockResolvedValue(profileRow(googleOnly));
    const profile = await ProfileSvc.getProfile("u1");
    expect(profile).toMatchObject({
      hasPassword: false,
      needsCredentialSetup: true,
    });
    expect(profile).not.toHaveProperty("credentials");
  });

  it("lets a Google account with both continue", async () => {
    const profile = await ProfileSvc.getProfile("u1");
    expect(profile).toMatchObject({
      hasPassword: true,
      needsCredentialSetup: false,
    });
  });
});

describe("ProfileSvc.setUpCredentials", () => {
  it("saves the username, then sets the password on the caller's session", async () => {
    repo.findCredentialState.mockResolvedValue(googleOnly);

    const profile = await ProfileSvc.setUpCredentials(
      "u1",
      { username: "new.name", password: GOOD_PASSWORD },
      headers,
    );

    expect(repo.updateProfile).toHaveBeenCalledWith("u1", {
      username: "new.name",
    });
    expect(setPassword).toHaveBeenCalledTimes(1);
    const call = setPassword.mock.calls[0][0] as {
      body: { newPassword: string };
      headers: Headers;
    };
    expect(call.body).toEqual({ newPassword: GOOD_PASSWORD });
    expect(call.headers.get("cookie")).toBe(headers.cookie);
    expect(repo.updateProfile.mock.invocationCallOrder[0]).toBeLessThan(
      setPassword.mock.invocationCallOrder[0],
    );
    expect(syncDetectedSteps).toHaveBeenCalledWith("u1");
    expect(profile.needsCredentialSetup).toBe(false);
  });

  it("keeps an existing username and only sets the password", async () => {
    repo.findCredentialState.mockResolvedValue({
      ...googleOnly,
      username: "kept.name",
    });

    await ProfileSvc.setUpCredentials(
      "u1",
      { username: "other.name", password: GOOD_PASSWORD },
      headers,
    );

    expect(repo.updateProfile).not.toHaveBeenCalled();
    expect(setPassword).toHaveBeenCalledTimes(1);
  });

  it("sets only the username when the password is already there", async () => {
    repo.findCredentialState.mockResolvedValue({
      ...googleOnly,
      hasPassword: true,
    });

    await ProfileSvc.setUpCredentials("u1", { username: "new.name" }, headers);

    expect(repo.updateProfile).toHaveBeenCalledTimes(1);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("refuses an account that needs no setup", async () => {
    repo.findCredentialState.mockResolvedValue({
      username: "a.b",
      hasGoogle: true,
      hasPassword: true,
    });
    await expect(
      ProfileSvc.setUpCredentials("u1", { username: "x.y" }, headers),
    ).rejects.toMatchObject({ message: CREDENTIALS_ALREADY_SET, status: 409 });
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses an account that isn't linked to Google", async () => {
    repo.findCredentialState.mockResolvedValue({
      username: null,
      hasGoogle: false,
      hasPassword: false,
    });
    await expect(
      ProfileSvc.setUpCredentials(
        "u1",
        { username: "a.b", password: GOOD_PASSWORD },
        headers,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("never replaces a password that is already set", async () => {
    repo.findCredentialState.mockResolvedValue({
      ...googleOnly,
      hasPassword: true,
    });
    await expect(
      ProfileSvc.setUpCredentials(
        "u1",
        { username: "new.name", password: GOOD_PASSWORD },
        headers,
      ),
    ).rejects.toMatchObject({
      message: PASSWORD_ALREADY_SET,
      status: 409,
      field: "password",
    });
    expect(repo.updateProfile).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["username", { password: GOOD_PASSWORD }],
    ["password", { username: "new.name" }],
  ])("asks for the missing %s", async (field, input) => {
    repo.findCredentialState.mockResolvedValue(googleOnly);
    await expect(
      ProfileSvc.setUpCredentials("u1", input, headers),
    ).rejects.toMatchObject({ status: 400, field });
    expect(repo.updateProfile).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("refuses a taken username and sets nothing", async () => {
    repo.findCredentialState.mockResolvedValue(googleOnly);
    repo.findByUsernameExcludingUserId.mockResolvedValue({ id: "u2" });
    await expect(
      ProfileSvc.setUpCredentials(
        "u1",
        { username: "taken", password: GOOD_PASSWORD },
        headers,
      ),
    ).rejects.toMatchObject({
      message: USERNAME_TAKEN,
      status: 400,
      field: "username",
    });
    expect(repo.updateProfile).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("reports a username taken between the check and the save", async () => {
    repo.findCredentialState.mockResolvedValue(googleOnly);
    repo.updateProfile.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );
    await expect(
      ProfileSvc.setUpCredentials(
        "u1",
        { username: "raced", password: GOOD_PASSWORD },
        headers,
      ),
    ).rejects.toMatchObject({ message: USERNAME_TAKEN, field: "username" });
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("answers 409 when Better Auth finds a password already set", async () => {
    repo.findCredentialState.mockResolvedValue({
      ...googleOnly,
      username: "a.b",
    });
    setPassword.mockRejectedValueOnce(
      new APIError("BAD_REQUEST", {
        message: "Password already set",
        code: "PASSWORD_ALREADY_SET",
      }),
    );
    await expect(
      ProfileSvc.setUpCredentials("u1", { password: GOOD_PASSWORD }, headers),
    ).rejects.toMatchObject({ message: PASSWORD_ALREADY_SET, status: 409 });
  });
});

function respond() {
  return {
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function post(body: Record<string, unknown>) {
  const res = respond();
  const req = { user: { userId: "u1" }, body, headers } as unknown as Request;
  await ProfileCtrl.setUpCredentials(req, res as unknown as Response);
  return res;
}

async function check(query: Record<string, unknown>) {
  const res = respond();
  const req = { user: { userId: "u1" }, query } as unknown as Request;
  await ProfileCtrl.checkUsername(req, res as unknown as Response);
  return res;
}

describe("POST /profile/credentials validation", () => {
  beforeEach(() => repo.findCredentialState.mockResolvedValue(googleOnly));

  it("sets both and answers with the profile", async () => {
    const res = await post({
      username: "New.Name",
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.needsCredentialSetup).toBe(false);
    // Lowercased by the username rule before it is saved.
    expect(repo.updateProfile).toHaveBeenCalledWith("u1", {
      username: "new.name",
    });
  });

  it("refuses a password that breaks the policy", async () => {
    const res = await post({
      username: "new.name",
      password: "short",
      confirmPassword: "short",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("password");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that doesn't match", async () => {
    const res = await post({
      username: "new.name",
      password: GOOD_PASSWORD,
      confirmPassword: `${GOOD_PASSWORD}x`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("confirmPassword");
    expect(res.body.message).toBe("Passwords do not match");
  });

  it("refuses a password without its confirmation", async () => {
    const res = await post({ username: "new.name", password: GOOD_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("confirmPassword");
  });

  it("refuses a username that breaks the rule", async () => {
    const res = await post({
      username: "bad name!",
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("username");
  });

  it("passes the service's refusal through with its status and field", async () => {
    repo.findByUsernameExcludingUserId.mockResolvedValue({ id: "u2" });
    const res = await post({
      username: "taken",
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: USERNAME_TAKEN,
      field: "username",
    });
  });
});

describe("GET /profile/username-availability", () => {
  it("says a free username is available, lowercased", async () => {
    const res = await check({ username: "Free.Name" });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ username: "free.name", available: true });
    expect(repo.findByUsernameExcludingUserId).toHaveBeenCalledWith(
      "free.name",
      "u1",
    );
  });

  it("says a taken username is not available", async () => {
    repo.findByUsernameExcludingUserId.mockResolvedValue({ id: "u2" });
    const res = await check({ username: "taken" });
    expect(res.body.data.available).toBe(false);
  });

  it("refuses a username that breaks the rule", async () => {
    const res = await check({ username: "no spaces" });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("username");
    expect(repo.findByUsernameExcludingUserId).not.toHaveBeenCalled();
  });
});
