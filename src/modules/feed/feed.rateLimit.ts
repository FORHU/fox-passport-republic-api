import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";
import { createRateLimitStore } from "../../utils/rate-limit-store";

// POST /feed/:id/share bumps a public counter on every call with no dedupe
// (each copy-link / Facebook share counts), so it is capped to keep a script
// from inflating a post's share count. The route is optionalAuth: signed-in
// callers are keyed by account (so a shared office network doesn't share one
// bucket), guests by IP. Always on, unlike the prod-only global limiter.
export const SHARE_TRACK_WINDOW_MS = 60 * 1000;
export const SHARE_TRACK_MAX = 30;

export const shareTrackLimiter = rateLimit({
  windowMs: SHARE_TRACK_WINDOW_MS,
  limit: SHARE_TRACK_MAX,
  store: createRateLimitStore("feed-share:account-or-ip"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    req.user?.userId ?? `ip:${ipKeyGenerator(req.ip ?? "")}`,
  message: {
    success: false,
    message: "Too many share requests. Please slow down.",
  },
});

// POST /feed/views is batched by the client (one call every few seconds while
// scrolling) and deduped per (post, viewer) in the database, so this is only a
// backstop against a runaway or scripted client. `authenticate` runs first.
export const VIEWS_WINDOW_MS = 60 * 1000;
export const VIEWS_MAX = 60;

export const recordViewsLimiter = rateLimit({
  windowMs: VIEWS_WINDOW_MS,
  limit: VIEWS_MAX,
  store: createRateLimitStore("feed-views:account"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user!.userId,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
});
