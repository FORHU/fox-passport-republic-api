import rateLimit from "express-rate-limit";
import { Request } from "express";

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
  max: FOLLOW_TOGGLE_MAX,
  standardHeaders: true,
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
