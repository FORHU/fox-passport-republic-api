import rateLimit from "express-rate-limit";
import { Request } from "express";
import { createRateLimitStore } from "../../utils/rate-limit-store";

// A code is short on purpose, so a script could try codes one after another to
// find a working one. Entering a code is something a person does once, so a
// small budget per account stops that without ever being noticed. Keyed by
// user, not IP: `authenticate` runs first, and a shared network is not one
// person.
export const REFERRAL_APPLY_WINDOW_MS = 60 * 60 * 1000;
export const REFERRAL_APPLY_MAX = 10;

export const referralApplyLimiter = rateLimit({
  windowMs: REFERRAL_APPLY_WINDOW_MS,
  limit: REFERRAL_APPLY_MAX,
  store: createRateLimitStore("referral-apply:account"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user!.userId,
  message: {
    success: false,
    message: "Too many tries. Please wait a while and try again.",
  },
});
