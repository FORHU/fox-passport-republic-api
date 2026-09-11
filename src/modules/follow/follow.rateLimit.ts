import rateLimit from "express-rate-limit";
import { Request } from "express";
import { createRateLimitStore } from "../../utils/rate-limit-store";

// Follow/unfollow is a single cheap write with no confirmation step, which
// makes it the easiest thing in the API to spam-click or script (follow-bomb
// a target, or hammer pending-request notifications). The global limiter in
// app.ts (1000 req / 15 min, prod-only) is too loose to catch that and is
// skipped entirely in dev, so this one is scoped to the toggle routes and
// always on.
export const FOLLOW_TOGGLE_WINDOW_MS = 60 * 1000;
export const FOLLOW_TOGGLE_MAX = 20;

export const followToggleLimiter = rateLimit({
  windowMs: FOLLOW_TOGGLE_WINDOW_MS,
  // `limit`, not `max`: the old name is deprecated and this file arrived from
  // main written against express-rate-limit 7, which this branch has since
  // taken to 8.
  limit: FOLLOW_TOGGLE_MAX,
  // Shared with every other limiter, and prefixed. On the default MemoryStore
  // this budget came back on every restart - under nodemon, on every file save
  // - and each container kept its own, so N instances meant N times 20 a
  // minute. The prefix is not optional: one Redis means the buckets are only
  // separate if the keys are, and this one keys on a user id, as the OTP and
  // login limiters key on an email.
  store: createRateLimitStore("follow-toggle:account"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Keyed by user rather than IP: `authenticate` runs first on every route
  // this is mounted on, so `req.user` is always set here, and keying by IP
  // would let a shared office/campus network share one bucket across
  // unrelated users.
  keyGenerator: (req: Request) => req.user!.userId,
  message: {
    success: false,
    message: "Too many follow/unfollow requests. Please slow down.",
  },
});
