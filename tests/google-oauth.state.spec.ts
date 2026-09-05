import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * The Google flow shipped with no `state` at all: the callback accepted any
 * `code` from anyone. That is login CSRF - an attacker completes the consent
 * screen themselves, hands the victim the resulting callback URL, and the
 * victim's browser is silently signed into the attacker's account. Everything
 * the victim then does belongs to the attacker.
 *
 * The property under test is narrow and worth pinning: the callback must reach
 * `handleCallback` only when the `state` Google echoes back matches the cookie
 * set on the way out.
 */

const svc = vi.hoisted(() => ({
  createState: vi.fn(() => "state-from-service"),
  getAuthUrl: vi.fn(
    (state: string) => `https://accounts.google.com/?state=${state}`,
  ),
  handleCallback: vi.fn(async () => ({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    isNewUser: false,
    user: { id: "u1" },
  })),
  stashSession: vi.fn(async () => "exchange-code"),
  redeemSession: vi.fn(),
}));

vi.mock("../src/config", () => ({
  FRONTEND_URL: "https://app.example.com",
  isDev: false,
  ACCESS_TOKEN_SECRET: "test-access-secret",
  ACCESS_TOKEN_EXPIRY: "15m",
  REFRESH_TOKEN_SECRET: "test-refresh-secret",
  REFRESH_TOKEN_EXPIRY: "7d",
}));

vi.mock("../src/utils/prisma", () => ({ prisma: {} }));
vi.mock("../src/modules/auth/auth.service", () => ({ default: {} }));
vi.mock("../src/modules/auth/google-auth.service", () => ({ default: svc }));

import AuthCtrl from "../src/modules/auth/auth.controller";

interface Recorded {
  redirect: string | null;
  cookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }>;
  cleared: string[];
}

function fakeRes() {
  const recorded: Recorded = { redirect: null, cookies: [], cleared: [] };
  const res = {
    redirect: vi.fn((url: string) => {
      recorded.redirect = url;
      return res;
    }),
    cookie: vi.fn(
      (name: string, value: string, options: Record<string, unknown>) => {
        recorded.cookies.push({ name, value, options });
        return res;
      },
    ),
    clearCookie: vi.fn((name: string) => {
      recorded.cleared.push(name);
      return res;
    }),
  };
  return { res: res as unknown as Response, recorded };
}

function fakeReq(query: Record<string, string>, cookieHeader?: string) {
  return {
    query,
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  } as unknown as Request;
}

const ERROR_REDIRECT = "https://app.example.com/?googleAuthError=1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("googleRedirect", () => {
  it("sends the same state to Google that it stores in the cookie", () => {
    const { res, recorded } = fakeRes();
    AuthCtrl.googleRedirect(fakeReq({}), res);

    expect(recorded.cookies).toHaveLength(1);
    const cookie = recorded.cookies[0];
    expect(cookie.value).toBe("state-from-service");
    expect(svc.getAuthUrl).toHaveBeenCalledWith("state-from-service");
    expect(recorded.redirect).toContain("state=state-from-service");
  });

  it("stores the state in a cookie the page's JavaScript cannot read", () => {
    const { res, recorded } = fakeRes();
    AuthCtrl.googleRedirect(fakeReq({}), res);

    const { options } = recorded.cookies[0];
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    // Strict would be dropped on the top-level redirect back from Google,
    // which would silently disable the check this cookie exists for.
    expect(options.sameSite).toBe("lax");
  });
});

describe("googleCallback state validation", () => {
  it("refuses a callback carrying no state cookie", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(fakeReq({ code: "abc", state: "s1" }), res);

    expect(svc.handleCallback).not.toHaveBeenCalled();
    expect(recorded.redirect).toBe(ERROR_REDIRECT);
  });

  it("refuses a callback whose state does not match the cookie", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq(
        { code: "abc", state: "attacker-state" },
        "g_oauth_state=victim-state",
      ),
      res,
    );

    expect(svc.handleCallback).not.toHaveBeenCalled();
    expect(recorded.redirect).toBe(ERROR_REDIRECT);
  });

  it("refuses a callback with no state parameter at all", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ code: "abc" }, "g_oauth_state=victim-state"),
      res,
    );

    expect(svc.handleCallback).not.toHaveBeenCalled();
    expect(recorded.redirect).toBe(ERROR_REDIRECT);
  });

  it("accepts a callback whose state matches, and exchanges the code", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ code: "abc", state: "matching" }, "g_oauth_state=matching"),
      res,
    );

    expect(svc.handleCallback).toHaveBeenCalledWith("abc");
    expect(recorded.redirect).toBe(
      "https://app.example.com/auth/google/callback?xc=exchange-code",
    );
  });

  it("finds the state cookie among others on the header", async () => {
    const { res } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq(
        { code: "abc", state: "matching" },
        "other=1; g_oauth_state=matching; another=2",
      ),
      res,
    );

    expect(svc.handleCallback).toHaveBeenCalledWith("abc");
  });

  it("clears the state cookie so one round trip cannot be replayed", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ code: "abc", state: "matching" }, "g_oauth_state=matching"),
      res,
    );

    expect(recorded.cleared).toContain("g_oauth_state");
  });

  it("clears the state cookie on a rejected callback too", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ code: "abc", state: "wrong" }, "g_oauth_state=matching"),
      res,
    );

    expect(recorded.cleared).toContain("g_oauth_state");
  });

  it("still handles Google reporting its own error", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ error: "access_denied" }, "g_oauth_state=matching"),
      res,
    );

    expect(svc.handleCallback).not.toHaveBeenCalled();
    expect(recorded.redirect).toBe(ERROR_REDIRECT);
  });
});

describe("what the redirect carries", () => {
  it("hands over a reference, never the tokens themselves", async () => {
    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ code: "abc", state: "matching" }, "g_oauth_state=matching"),
      res,
    );

    // The whole point of the exchange code: this URL reaches browser history,
    // the next request's Referer, and every access log on the way.
    expect(recorded.redirect).not.toContain("access-token");
    expect(recorded.redirect).not.toContain("refresh-token");
    expect(recorded.redirect).toContain("xc=");
    expect(svc.stashSession).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      isNewUser: false,
    });
  });

  it("fails the sign-in rather than falling back when the session cannot be parked", async () => {
    svc.stashSession.mockRejectedValueOnce(new Error("redis down"));

    const { res, recorded } = fakeRes();
    await AuthCtrl.googleCallback(
      fakeReq({ code: "abc", state: "matching" }, "g_oauth_state=matching"),
      res,
    );

    expect(recorded.redirect).toBe(ERROR_REDIRECT);
  });
});

describe("googleExchange", () => {
  function exchangeRes() {
    const captured: { status: number | null; body: unknown } = {
      status: null,
      body: null,
    };
    const res = {
      status: vi.fn((code: number) => {
        captured.status = code;
        return res;
      }),
      json: vi.fn((body: unknown) => {
        captured.body = body;
        return res;
      }),
    };
    return { res: res as unknown as Response, captured };
  }

  it("returns the parked session for a valid code", async () => {
    const session = {
      accessToken: "a",
      refreshToken: "r",
      isNewUser: true,
    };
    svc.redeemSession.mockResolvedValueOnce(session);

    const { res, captured } = exchangeRes();
    await AuthCtrl.googleExchange(
      { body: { code: "good-code" } } as unknown as Request,
      res,
    );

    expect(svc.redeemSession).toHaveBeenCalledWith("good-code");
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ data: session });
  });

  it("rejects a code that has already been redeemed or expired", async () => {
    svc.redeemSession.mockResolvedValueOnce(null);

    const { res, captured } = exchangeRes();
    await AuthCtrl.googleExchange(
      { body: { code: "spent-code" } } as unknown as Request,
      res,
    );

    expect(captured.status).toBe(400);
  });

  it("rejects a non-string code without reaching the store", async () => {
    const { res, captured } = exchangeRes();
    await AuthCtrl.googleExchange(
      { body: { code: { $ne: null } } } as unknown as Request,
      res,
    );

    expect(svc.redeemSession).not.toHaveBeenCalled();
    expect(captured.status).toBe(400);
  });

  it("rejects a missing body", async () => {
    const { res, captured } = exchangeRes();
    await AuthCtrl.googleExchange({} as unknown as Request, res);

    expect(svc.redeemSession).not.toHaveBeenCalled();
    expect(captured.status).toBe(400);
  });
});
