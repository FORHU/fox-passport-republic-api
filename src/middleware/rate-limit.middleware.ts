import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

/**
 * Rate limits for the authentication surface.
 *
 * The app-wide limiter in `app.ts` is sized for ordinary browsing - 1000
 * requests per 15 minutes - and is disabled in development. Nothing stopped a
 * single IP spending that entire budget guessing passwords, at roughly 66
 * attempts a minute. These limits sit in front of the credential endpoints
 * specifically, and stay on in development: a limiter that only ever runs in
 * production is a limiter nobody has tested.
 *
 * Two axes, because one alone is trivially sidestepped:
 *
 *  - **per IP** catches credential stuffing, where one attacker tries one
 *    password against thousands of accounts. An account-keyed limit never fires
 *    on that traffic - every request names a different account.
 *  - **per account** catches a distributed brute force against one inbox, where
 *    every request comes from a different address. An IP-keyed limit never fires
 *    on that either.
 *
 * Keeping them separate is also what stops a shared exit IP - an office, a
 * campus, a mobile carrier's NAT - from locking out everyone behind it: the
 * per-account budget is the tight one, and it only ever spends against the
 * account actually being attacked.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/**
 * 429 in the same shape as every other error the API answers with, so clients
 * that already parse `{ success, message }` need no special case.
 */
function reject(message: string) {
  return (req: Request, res: Response) => {
    console.warn(
      `🚦 Rate limit: ${req.method} ${req.originalUrl} from ${req.ip}`,
    );
    res.status(429).json({ success: false, message });
  };
}

/**
 * The account an attempt is aimed at. Normalised the same way the login lookup
 * normalises it, or `Foo@x.com` and `foo@x.com` would get a budget each.
 */
function accountKey(req: Request): string | null {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;
  const normalised = email.trim().toLowerCase();
  return normalised.length > 0 ? normalised : null;
}

interface LimitOptions {
  windowMs: number;
  limit: number;
  message: string;
  /**
   * Count only what failed. Right for guessing endpoints - a successful sign-in
   * is not evidence of an attack, and counting it would punish anyone who
   * genuinely signs in and out repeatedly. Wrong for endpoints where the
   * *success* is the abuse, such as sending mail.
   */
  failuresOnly?: boolean;
}

function perIp({ windowMs, limit, message, failuresOnly }: LimitOptions) {
  return rateLimit({
    windowMs,
    limit,
    // Default key generator: `app.set("trust proxy", 1)` in app.ts means req.ip
    // is the client, not the proxy in front of it.
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly ?? false,
    handler: reject(message),
  });
}

function perAccount({ windowMs, limit, message, failuresOnly }: LimitOptions) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => accountKey(req) ?? "",
    // A request naming no account cannot be keyed to one. Skipping keeps them
    // out of a shared empty-string bucket, where unrelated malformed requests
    // would exhaust one budget between them; the per-IP limit still covers them.
    skip: (req) => accountKey(req) === null,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly ?? false,
    handler: reject(message),
  });
}

const TOO_MANY_ATTEMPTS =
  "Too many attempts. Please wait a few minutes and try again.";
const TOO_MANY_REQUESTS =
  "Too many requests. Please wait a few minutes and try again.";

/**
 * Sign-in. Failure-only, so ordinary use never accumulates: the budget exists
 * for wrong passwords.
 */
export const loginRateLimit = [
  perIp({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: TOO_MANY_ATTEMPTS,
    failuresOnly: true,
  }),
  perAccount({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    message: TOO_MANY_ATTEMPTS,
    failuresOnly: true,
  }),
];

/**
 * Account creation. Every request counts, including the successful ones - mass
 * signup is the abuse here, not failed attempts.
 */
export const registerRateLimit = [
  perIp({
    windowMs: ONE_HOUR,
    limit: 10,
    message: TOO_MANY_REQUESTS,
  }),
];

/**
 * Refresh. Generous, because a shared IP legitimately refreshes often - one
 * request per user per 15 minutes, and the proxy already collapses parallel
 * refreshes. Failure-only, so the budget is spent only by tokens that do not
 * work: the shape of someone probing for a valid one.
 */
export const refreshRateLimit = [
  perIp({
    windowMs: FIFTEEN_MINUTES,
    limit: 60,
    message: TOO_MANY_REQUESTS,
    failuresOnly: true,
  }),
];

/**
 * Endpoints that send mail - forgot-password, resend-verification-otp.
 *
 * Counted in full rather than failure-only, because here the successful request
 * is the abuse: each one puts a message in someone's inbox, and an attacker
 * needs no valid credential to trigger it.
 */
export const otpSendRateLimit = [
  perIp({
    windowMs: ONE_HOUR,
    limit: 10,
    message: TOO_MANY_REQUESTS,
  }),
  perAccount({
    windowMs: ONE_HOUR,
    limit: 5,
    message: TOO_MANY_REQUESTS,
  }),
];

/**
 * Endpoints that check a one-time code - verify-email, reset-password.
 *
 * `generateOTP` returns six digits, so the code space is 900,000. That is small
 * enough to be walked by a script in minutes if nothing counts the attempts,
 * and reset-password is a full account takeover when it lands. Failure-only:
 * the correct code is used once and works.
 */
export const otpVerifyRateLimit = [
  perIp({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: TOO_MANY_ATTEMPTS,
    failuresOnly: true,
  }),
  perAccount({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    message: TOO_MANY_ATTEMPTS,
    failuresOnly: true,
  }),
];
