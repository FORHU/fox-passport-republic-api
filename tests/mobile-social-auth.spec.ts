import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * The native mobile app signs in two ways, and both end in the same session
 * payload the web exchange returns:
 *
 *  - the browser redirect flow, where the system browser is sent back to the
 *    app's own URL scheme (`foxpassport://app`) instead of an https origin;
 *  - the native flow, where the app posts a Google ID token it got on-device.
 *
 * The redirect target has to be an exact match against a configured list - a
 * looser check would turn `?origin=` into an open redirect.
 */

const google = vi.hoisted(() => ({
  createState: vi.fn(() => "state-from-service"),
  getAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/auth"),
  handleCallback: vi.fn(async () => ({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    isNewUser: false,
    user: { id: "u1" },
  })),
  handleIdToken: vi.fn(),
  stashSession: vi.fn(async () => "exchange-code"),
  redeemSession: vi.fn(),
}));

const facebook = vi.hoisted(() => ({
  handleAccessToken: vi.fn(),
}));

vi.mock("../src/config", () => ({
  FRONTEND_URL: "https://app.example.com",
  CORS_ORIGINS: ["https://app.example.com"],
  MOBILE_REDIRECT_ORIGINS: ["foxpassport://app"],
  FACEBOOK_CALLBACK_URL: "https://api.example.com/api/v1/auth/facebook/callback",
  isDev: false,
  ACCESS_TOKEN_SECRET: "test-access-secret",
  ACCESS_TOKEN_EXPIRY: "15m",
  REFRESH_TOKEN_SECRET: "test-refresh-secret",
  REFRESH_TOKEN_EXPIRY: "7d",
  refreshTokenTtlMs: () => 7 * 24 * 60 * 60 * 1000,
}));

vi.mock("../src/utils/prisma", () => ({ prisma: {} }));
vi.mock("../src/modules/auth/auth.service", () => ({ default: {} }));
vi.mock("../src/modules/auth/google-auth.service", () => ({ default: google }));
vi.mock("../src/modules/auth/facebook-auth.service", () => ({
  default: facebook,
}));

import AuthCtrl from "../src/modules/auth/auth.controller";

interface Recorded {
  redirect: string | null;
  status: number | null;
  body: unknown;
  cookies: Array<{ name: string; value: string }>;
}

function fakeRes() {
  const recorded: Recorded = {
    redirect: null,
    status: null,
    body: null,
    cookies: [],
  };
  const res = {
    redirect: vi.fn((url: string) => {
      recorded.redirect = url;
      return res;
    }),
    cookie: vi.fn((name: string, value: string) => {
      recorded.cookies.push({ name, value });
      return res;
    }),
    clearCookie: vi.fn(() => res),
    status: vi.fn((code: number) => {
      recorded.status = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      recorded.body = body;
      return res;
    }),
  };
  return { res: res as unknown as Response, recorded };
}

function fakeReq(
  opts: {
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    cookie?: string;
  } = {},
) {
  return {
    query: opts.query ?? {},
    body: opts.body ?? {},
    headers: opts.cookie ? { cookie: opts.cookie } : {},
    protocol: "https",
    get: (name: string) =>
      name.toLowerCase() === "host" ? "api.example.com" : undefined,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mobile redirect origin", () => {
  /** Runs the start of the flow, then feeds its cookie to the callback. */
  async function roundTrip(origin: string) {
    const start = fakeRes();
    AuthCtrl.googleRedirect(fakeReq({ query: { origin } }), start.res);
    const stateCookie = start.recorded.cookies[0].value;

    const end = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({
        query: { code: "abc", state: stateCookie },
        cookie: `g_oauth_state=${stateCookie}`,
      }),
      end.res,
    );
    return end.recorded.redirect;
  }

  it("returns the browser to the app's registered URL scheme", async () => {
    const redirect = await roundTrip("foxpassport://app");

    expect(redirect).toBe("foxpassport://app/auth/google/callback?xc=exchange-code");
  });

  it("refuses an unregistered scheme and falls back to the web app", async () => {
    const redirect = await roundTrip("evil://app");

    expect(redirect).toBe(
      "https://app.example.com/auth/google/callback?xc=exchange-code",
    );
  });

  it("does not treat a longer string starting with a registered origin as one", async () => {
    const redirect = await roundTrip("foxpassport://app.attacker.example");

    expect(redirect).toBe(
      "https://app.example.com/auth/google/callback?xc=exchange-code",
    );
  });
});

describe("POST /auth/google/mobile", () => {
  it("rejects a request with no idToken", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleMobile(fakeReq({ body: {} }), res);

    expect(recorded.status).toBe(400);
    expect(google.handleIdToken).not.toHaveBeenCalled();
  });

  it("returns the session in the body and sets no cookies", async () => {
    google.handleIdToken.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      isNewUser: true,
      user: { id: "u1" },
    });

    const { res, recorded } = fakeRes();
    await AuthCtrl.googleMobile(fakeReq({ body: { idToken: "id-token" } }), res);

    expect(google.handleIdToken).toHaveBeenCalledWith("id-token");
    expect(recorded.status).toBe(200);
    expect(recorded.body).toEqual({
      data: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        isNewUser: true,
        user: { id: "u1" },
      },
    });
    expect(recorded.cookies).toHaveLength(0);
  });

  it("answers 401 without saying which check failed", async () => {
    google.handleIdToken.mockRejectedValue(new Error("Wrong recipient, payload audience != requiredAudience"));

    const { res, recorded } = fakeRes();
    await AuthCtrl.googleMobile(fakeReq({ body: { idToken: "bad" } }), res);

    expect(recorded.status).toBe(401);
    expect(JSON.stringify(recorded.body)).not.toMatch(/audience/i);
  });
});

describe("POST /auth/facebook/mobile", () => {
  it("rejects a request with no accessToken", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.facebookMobile(fakeReq({ body: {} }), res);

    expect(recorded.status).toBe(400);
    expect(facebook.handleAccessToken).not.toHaveBeenCalled();
  });

  it("returns the session on success", async () => {
    facebook.handleAccessToken.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      isNewUser: false,
      user: { id: "u2" },
    });

    const { res, recorded } = fakeRes();
    await AuthCtrl.facebookMobile(fakeReq({ body: { accessToken: "fb" } }), res);

    expect(recorded.status).toBe(200);
    expect(facebook.handleAccessToken).toHaveBeenCalledWith("fb");
  });

  it("answers 401 when the token is refused", async () => {
    facebook.handleAccessToken.mockRejectedValue(new Error("not valid for this app"));

    const { res, recorded } = fakeRes();
    await AuthCtrl.facebookMobile(fakeReq({ body: { accessToken: "fb" } }), res);

    expect(recorded.status).toBe(401);
  });
});
