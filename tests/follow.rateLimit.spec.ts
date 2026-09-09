import { describe, it, expect } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import {
  followToggleLimiter,
  FOLLOW_TOGGLE_MAX,
} from "../src/modules/follow/follow.rateLimit";

/**
 * The follow toggle endpoint had no rate limiting at all — the global
 * limiter in app.ts is prod-only and generous (1000 req / 15 min), so
 * nothing stood between a script and a follow-bombed account. This exercises
 * the limiter directly against a stub route rather than the real app, since
 * the real route also touches Prisma and this is only testing the limiter.
 */

function buildApp(userId: string) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId } as Request["user"];
    next();
  });
  app.use(followToggleLimiter);
  app.post("/toggle", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("followToggleLimiter", () => {
  it("allows requests up to the limit", async () => {
    const app = buildApp("user-allow");

    for (let i = 0; i < FOLLOW_TOGGLE_MAX; i++) {
      const res = await request(app).post("/toggle");
      expect(res.status).toBe(200);
    }
  });

  it("blocks a request once a single user exceeds the limit", async () => {
    const app = buildApp("user-block");

    for (let i = 0; i < FOLLOW_TOGGLE_MAX; i++) {
      await request(app).post("/toggle");
    }
    const res = await request(app).post("/toggle");

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
  });

  it("keys by user, not IP — a different user on the same connection gets a fresh bucket", async () => {
    const exhausted = buildApp("user-a");
    for (let i = 0; i < FOLLOW_TOGGLE_MAX; i++) {
      await request(exhausted).post("/toggle");
    }
    expect((await request(exhausted).post("/toggle")).status).toBe(429);

    const freshUser = buildApp("user-b");
    expect((await request(freshUser).post("/toggle")).status).toBe(200);
  });
});
