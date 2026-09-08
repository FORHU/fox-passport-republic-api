import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

/**
 * AUTH-06. Two problems in the same area, neither about how fast a code can be
 * tried - rate limiting already bounds that.
 *
 * `generateOTP` drew from `Math.random()`, which is predictable to anyone who
 * observes enough output, so the code was guessable rather than merely
 * brute-forceable. And every mail failure wrote the plaintext code to the log
 * next to the address it belongs to, in every environment: the `[DEV]` prefix
 * was a label, and `auth.service.ts` had no `isDev` check anywhere in it.
 */

describe("generateOTP", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws from crypto rather than Math.random", async () => {
    const random = vi.spyOn(Math, "random");
    const randomInt = vi.spyOn(crypto, "randomInt");

    const { generateOTP } = await import("../src/utils/otp.utils");
    generateOTP();

    expect(randomInt).toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it("draws across the whole six-digit space", async () => {
    const randomInt = vi.spyOn(crypto, "randomInt");

    const { generateOTP } = await import("../src/utils/otp.utils");
    generateOTP();

    // The old expression was `100000 + random * 900000`, so 0-99999 was
    // unreachable and a code never began with a zero.
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
  });

  it("pads a low draw to six digits instead of shortening the code", async () => {
    vi.spyOn(crypto, "randomInt").mockReturnValue(42 as never);

    const { generateOTP } = await import("../src/utils/otp.utils");

    expect(generateOTP()).toBe("000042");
  });

  it("always returns six digits", async () => {
    const { generateOTP } = await import("../src/utils/otp.utils");

    for (let i = 0; i < 200; i++) {
      expect(generateOTP()).toMatch(/^\d{6}$/);
    }
  });
});

/**
 * The leak itself. `forgotPassword` is the worst of the three sites - a reset
 * code in a log is an account takeover - so it stands in for all of them.
 */
describe("a mail failure during password reset", () => {
  const USER = {
    id: "user-id",
    email: "victim@example.com",
    username: "victim",
    name: "Victim",
    systemRole: "user",
    roleType: [],
  };

  /**
   * `isDev` is read from config at import time, so each case needs its own
   * module registry rather than a value flipped between tests.
   */
  async function forgotPasswordWithMailDown(isDev: boolean) {
    vi.resetModules();

    vi.doMock("../src/config", () => ({
      ACCESS_TOKEN_SECRET: "test-access-secret",
      ACCESS_TOKEN_EXPIRY: "15m",
      isDev,
    }));
    vi.doMock("../src/modules/auth/auth.repository", () => ({
      default: { findUserByEmail: vi.fn(async () => USER) },
    }));
    vi.doMock("../src/utils/otp.utils", () => ({
      generateOTP: vi.fn(() => "123456"),
      saveOTP: vi.fn(async () => undefined),
      verifyOTP: vi.fn(async () => true),
      deleteOTP: vi.fn(async () => undefined),
    }));
    vi.doMock("../src/utils/helpers", () => ({
      sendTemplatedEmail: vi.fn(async () => {
        throw new Error("mailer unavailable");
      }),
    }));
    vi.doMock("../src/modules/auth/refresh-token.service", () => ({
      issueRefreshToken: vi.fn(async () => "refresh-token"),
      verifyRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      revokeAllForUser: vi.fn(),
      rotateRefreshToken: vi.fn(),
      RefreshTokenError: class extends Error {},
    }));

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: AuthSvc } =
      await import("../src/modules/auth/auth.service");
    await AuthSvc.forgotPassword(USER.email);

    const written = (calls: unknown[][]) =>
      calls.map((args) => args.join(" ")).join("\n");

    return {
      logged: written(log.mock.calls),
      errored: written(error.mock.calls),
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("../src/config");
    vi.resetModules();
  });

  it("keeps the code out of the log in production", async () => {
    const { logged } = await forgotPasswordWithMailDown(false);

    expect(logged).not.toContain("123456");
    expect(logged).not.toContain(USER.email);
  });

  it("still records that the send failed in production", async () => {
    const { errored } = await forgotPasswordWithMailDown(false);

    // The failure is worth knowing about; the code is not what makes it legible.
    expect(errored).toContain("Failed to send password reset email");
    expect(errored).not.toContain("123456");
  });

  it("keeps the code in the log in development", async () => {
    const { logged } = await forgotPasswordWithMailDown(true);

    expect(logged).toContain("123456");
  });
});
