import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * A rate limit nobody has watched fire is a configuration, not a defence.
 *
 * These mount the real limiters on a stand-in app and hammer them, because the
 * failure mode being guarded against is silent: a limiter that is registered but
 * never reached, keyed on something that varies per request, or counting
 * successes when it should count failures, looks exactly like a working one
 * until someone actually attacks the endpoint.
 */

/**
 * Each test needs its own counters. The limiters hold state in module scope, so
 * without a fresh import per test the second test starts inside the first one's
 * budget. Hence the dynamic import here rather than a static one at the top.
 */
async function freshLimiters() {
  vi.resetModules();
  return import("../src/middleware/rate-limit.middleware");
}

/**
 * `outcome` decides what the handler answers, which is what
 * `skipSuccessfulRequests` keys off. 401 stands in for a wrong password.
 */
function appWith(
  limiter: express.RequestHandler[],
  outcome: () => number = () => 401,
) {
  const app = express();
  app.use(express.json());
  app.post("/auth/test", limiter, (_req, res) => {
    res.status(outcome()).json({ success: outcome() < 400 });
  });
  return app;
}

async function post(app: express.Express, body: Record<string, unknown>) {
  return request(app).post("/auth/test").send(body);
}

beforeEach(() => {
  vi.restoreAllMocks();
  // The limiters log every rejection; keep the test output readable.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("login rate limit", () => {
  it("answers 429 once an account's failed attempts run out", async () => {
    const { loginRateLimit: limiter } = await freshLimiters();
    const app = appWith(limiter);

    // The per-account budget is the tighter of the two, so it trips first.
    for (let i = 0; i < 10; i++) {
      const res = await post(app, {
        email: "victim@example.com",
        password: "wrong",
      });
      expect(res.status).toBe(401);
    }

    const blocked = await post(app, {
      email: "victim@example.com",
      password: "wrong",
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false });
    expect(blocked.body.message).toMatch(/too many/i);
  });

  it("keys the account budget on the normalised address", async () => {
    const { loginRateLimit: limiter } = await freshLimiters();
    const app = appWith(limiter);

    // Casing and surrounding space must not buy a fresh budget, or the limit is
    // one `.toUpperCase()` away from being bypassed entirely.
    for (let i = 0; i < 10; i++) {
      await post(app, { email: "Victim@Example.com ", password: "wrong" });
    }

    const blocked = await post(app, {
      email: "victim@example.com",
      password: "wrong",
    });
    expect(blocked.status).toBe(429);
  });

  it("does not spend an account's budget on a different account", async () => {
    const { loginRateLimit: limiter } = await freshLimiters();
    const app = appWith(limiter);

    for (let i = 0; i < 10; i++) {
      await post(app, { email: "victim@example.com", password: "wrong" });
    }

    // Same IP, different account. The per-IP budget is 30 and only 10 are spent,
    // so this must still be served - otherwise everyone behind one office NAT
    // is locked out by one attacker.
    const other = await post(app, {
      email: "bystander@example.com",
      password: "wrong",
    });
    expect(other.status).toBe(401);
  });

  it("does not count successful sign-ins", async () => {
    const { loginRateLimit: limiter } = await freshLimiters();
    const app = appWith(limiter, () => 200);

    // Well past the failure budget. Signing in and out repeatedly is ordinary
    // use and must never accumulate toward a lockout.
    for (let i = 0; i < 25; i++) {
      const res = await post(app, {
        email: "regular@example.com",
        password: "correct",
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("otp send rate limit", () => {
  it("counts successful sends, because the send is the abuse", async () => {
    const { otpSendRateLimit: limiter } = await freshLimiters();
    const app = appWith(limiter, () => 200);

    for (let i = 0; i < 5; i++) {
      const res = await post(app, { email: "target@example.com" });
      expect(res.status).toBe(200);
    }

    // Each of those put a message in someone's inbox. Failure-only counting
    // here would leave mail bombing entirely unmetered.
    const blocked = await post(app, { email: "target@example.com" });
    expect(blocked.status).toBe(429);
  });
});

describe("refresh rate limit", () => {
  it("serves ordinary refreshes and stops a probing run", async () => {
    const { refreshRateLimit: limiter } = await freshLimiters();
    const ok = appWith(limiter, () => 200);

    for (let i = 0; i < 60; i++) {
      expect((await post(ok, {})).status).toBe(200);
    }

    const { refreshRateLimit: other } = await freshLimiters();
    const failing = appWith(other, () => 401);

    for (let i = 0; i < 60; i++) {
      await post(failing, {});
    }
    expect((await post(failing, {})).status).toBe(429);
  });
});

describe("requests naming no account", () => {
  it("are not pooled into one shared budget", async () => {
    const { loginRateLimit: limiter } = await freshLimiters();
    const app = appWith(limiter);

    // A malformed body has no address to key on. If those all landed in one
    // bucket, unrelated clients would exhaust a single budget between them.
    // The per-IP limit of 30 still applies, so ask for fewer than that.
    for (let i = 0; i < 25; i++) {
      const res = await post(app, { password: "wrong" });
      expect(res.status).toBe(401);
    }
  });
});
