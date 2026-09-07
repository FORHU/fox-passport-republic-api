import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * The cookies this API now emits are relayed to the browser by the Next app's
 * proxy, and the browser files them against *the app's* origin. That only works
 * for host-only cookies. A `Domain=` attribute here would name this host, and
 * the browser would refuse the cookie when it arrived from the app's - sign-in
 * would appear to succeed and then behave as though nobody was signed in.
 *
 * Nothing in the type system says "no domain", so this is the test that says it.
 */

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

vi.mock("../src/config", () => ({
  isDev: false,
  // The real derivation lives in config and is covered by the rotation spec.
  // Stubbing it here is what makes "the cookie lifetime comes from the refresh
  // token's TTL" an assertion rather than a coincidence of two literals.
  refreshTokenTtlMs: () => SEVEN_DAYS_SECONDS * 1000,
}));

async function appWith(
  handler: (
    cookies: typeof import("../src/modules/auth/auth.cookies"),
    res: express.Response,
  ) => void,
) {
  const cookies = await import("../src/modules/auth/auth.cookies");
  const app = express();
  app.post("/t", (_req, res) => {
    handler(cookies, res);
    res.status(200).json({ ok: true });
  });
  return app;
}

const SESSION = {
  accessToken: "access-token-value",
  refreshToken: "refresh-token-value",
  user: { id: "u1", email: "someone@example.com", name: "Someone" },
};

function headersFrom(raw: string[] | undefined) {
  const list = raw ?? [];
  const byName = (name: string) => list.find((c) => c.startsWith(`${name}=`));
  return {
    all: list,
    access: byName("fox_token"),
    refresh: byName("fox_refresh_token"),
    user: byName("fox_user"),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("session cookies", () => {
  it("sets all three as separate headers", async () => {
    const app = await appWith((c, res) => c.setSessionCookies(res, SESSION));
    const res = await request(app).post("/t");
    const cookies = headersFrom(res.headers["set-cookie"] as never);

    // Three headers, not one folded together - the browser parses one cookie
    // per header and would take a comma-joined value as a single malformed one.
    expect(cookies.all).toHaveLength(3);
    expect(cookies.access).toBeDefined();
    expect(cookies.refresh).toBeDefined();
    expect(cookies.user).toBeDefined();
  });

  it("never sets a Domain attribute", async () => {
    const app = await appWith((c, res) => c.setSessionCookies(res, SESSION));
    const res = await request(app).post("/t");

    for (const cookie of (res.headers["set-cookie"] as never as string[]) ??
      []) {
      expect(cookie.toLowerCase()).not.toContain("domain=");
    }
  });

  it("keeps the token cookies unreadable by page scripts", async () => {
    const app = await appWith((c, res) => c.setSessionCookies(res, SESSION));
    const res = await request(app).post("/t");
    const cookies = headersFrom(res.headers["set-cookie"] as never);

    expect(cookies.access).toMatch(/HttpOnly/i);
    expect(cookies.refresh).toMatch(/HttpOnly/i);
    // fox_user is read by the app's client and by its server-side fallback, so
    // it is readable on purpose. It carries profile data and no token.
    expect(cookies.user).not.toMatch(/HttpOnly/i);
  });

  it("derives the lifetime from the refresh token's own expiry", async () => {
    const app = await appWith((c, res) => c.setSessionCookies(res, SESSION));
    const res = await request(app).post("/t");
    const cookies = headersFrom(res.headers["set-cookie"] as never);

    // A cookie outliving the token inside it is how the browser ended up
    // holding a credential the server had stopped honouring.
    for (const cookie of cookies.all) {
      const maxAge = /Max-Age=(\d+)/i.exec(cookie)?.[1];
      expect(maxAge).toBeDefined();
      expect(Number(maxAge)).toBe(SEVEN_DAYS_SECONDS);
    }
  });

  it("encodes the user cookie so JSON survives the trip", async () => {
    const app = await appWith((c, res) => c.setSessionCookies(res, SESSION));
    const res = await request(app).post("/t");
    const cookies = headersFrom(res.headers["set-cookie"] as never);

    const raw = cookies.user!.split(";")[0].replace("fox_user=", "");
    // Unencoded, the quotes and commas in the JSON would truncate the value at
    // the first delimiter. The app decodes with decodeURIComponent on both the
    // server and client sides.
    expect(() => JSON.parse(decodeURIComponent(raw))).not.toThrow();
    expect(JSON.parse(decodeURIComponent(raw))).toMatchObject({ id: "u1" });
  });

  it("omits the refresh cookie rather than blanking it when absent", async () => {
    const app = await appWith((c, res) =>
      c.setSessionCookies(res, { accessToken: "only-access" }),
    );
    const res = await request(app).post("/t");
    const cookies = headersFrom(res.headers["set-cookie"] as never);

    // Writing an empty value would clear the cookie and end the session at the
    // next refresh.
    expect(cookies.access).toBeDefined();
    expect(cookies.refresh).toBeUndefined();
  });
});

describe("clearing session cookies", () => {
  it("clears all three with matching attributes", async () => {
    const app = await appWith((c, res) => c.clearSessionCookies(res));
    const res = await request(app).post("/t");
    const cookies = headersFrom(res.headers["set-cookie"] as never);

    expect(cookies.all).toHaveLength(3);
    for (const cookie of cookies.all) {
      // A clear is a Set-Cookie with an expiry in the past, matched on name and
      // path. A mismatched path leaves the original in place.
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie.toLowerCase()).not.toContain("domain=");
    }
  });
});
