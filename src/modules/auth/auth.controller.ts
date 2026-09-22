import crypto from "crypto";
import { Request, Response } from "express";
import Joi from "joi";
import AuthSvc from "./auth.service";
import { setSessionCookies, clearSessionCookies } from "./auth.cookies";
import GoogleAuthSvc from "./google-auth.service";
import { issueSocketTicket } from "./socket-ticket.service";
import {
  RefreshTokenError,
  RefreshTokenReuseError,
} from "./refresh-token.service";
import { FRONTEND_URL, CORS_ORIGINS, isDev } from "../../config";
import { announceAdminQueueChanged } from "../../infrastructure/socket/invalidate";

/**
 * The `state` cookie is scoped to the Google routes and lives for the length of
 * one round trip to Google's consent screen. `SameSite=Lax` is deliberate and
 * load-bearing: the callback arrives as a top-level cross-site navigation from
 * accounts.google.com, which `Strict` would strip, taking the protection with
 * it.
 */
const GOOGLE_STATE_COOKIE = "g_oauth_state";
const GOOGLE_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: !isDev,
  sameSite: "lax",
  path: "/api/v1/auth/google",
  maxAge: 10 * 60 * 1000,
} as const;

/**
 * Reads one cookie off the raw header. The API mounts no cookie parser - this
 * is the only cookie it has ever needed - so pulling in middleware app-wide to
 * read a single short-lived value would be the larger change.
 */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** Constant-time compare that tolerates differing lengths. */
function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Mirrors the dev-mode LAN allowance in app.ts's CORS origin check — kept as
// its own small copy rather than imported, so this module doesn't reach into
// the top-level app composition file for one regex.
const LOCAL_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

function isAllowedOrigin(origin: string): boolean {
  return CORS_ORIGINS.includes(origin) || (isDev && LOCAL_ORIGIN.test(origin));
}

/**
 * The redirect_uri sent to Google, and later re-sent when exchanging the
 * code, must be whatever host+port the browser actually used to reach this
 * server — a phone on the LAN reaches the API at its LAN IP, not
 * `localhost`, and Google rejects a token exchange whose redirect_uri
 * doesn't byte-match the one used to start the flow. Every value this can
 * produce must be pre-registered as an Authorized redirect URI in Google
 * Cloud Console (e.g. both the localhost and LAN-IP variants for local dev).
 */
function resolveRedirectUri(req: Request): string {
  return `${req.protocol}://${req.get("host")}/api/v1/auth/google/callback`;
}

/**
 * Where to send the browser back to once sign-in completes — the frontend
 * origin that started the flow (passed as `?origin=`), so a phone that
 * opened the app at the LAN IP lands back on the LAN IP, not `localhost`
 * (which the phone can't reach). Falls back to FRONTEND_URL when the query
 * param is absent or isn't a recognized origin, so this never redirects
 * somewhere arbitrary.
 */
function resolveFrontendOrigin(req: Request): string {
  const requested = req.query.origin;
  if (typeof requested === "string" && isAllowedOrigin(requested)) {
    return requested;
  }
  return FRONTEND_URL;
}

/**
 * Recovers the frontend origin `googleRedirect` packed into `state` (see
 * there), so every redirect in `googleCallback` — including the error
 * paths — lands back on whichever host actually started the flow, instead
 * of unconditionally on FRONTEND_URL.
 */
function originFromState(state: string | undefined): string {
  if (!state) return FRONTEND_URL;
  const encoded = state.split("|")[1];
  if (!encoded) return FRONTEND_URL;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return isAllowedOrigin(decoded) ? decoded : FRONTEND_URL;
  } catch {
    return FRONTEND_URL;
  }
}

/**
 * The service throws the bare string "Invalid credentials" for a bad email or
 * password. Anything else - a Prisma error, a dropped connection, a bug - is a
 * server fault and must not be reported to the client as an auth failure.
 */
function isCredentialFailure(e: unknown): boolean {
  const message = typeof e === "string" ? e : (e as Error)?.message;
  return message === "Invalid credentials";
}

function isEmailVerificationFailure(e: unknown): boolean {
  const message = typeof e === "string" ? e : (e as Error)?.message;
  return message === "Email not verified";
}

export default class AuthCtrl {
  static async register(req: Request, res: Response) {
    const { email, password, username, name, mobileNumber } = req.body;

    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      username: Joi.string().required(),
      name: Joi.string().required(),
      mobileNumber: Joi.string().optional(),
    });

    const { error } = schema.validate({
      email,
      password,
      username,
      name,
      mobileNumber,
    });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const user = await AuthSvc.register({
        email,
        password,
        username,
        name,
        mobileNumber,
      });
      announceAdminQueueChanged();
      return res
        .status(201)
        .json({ message: "User registered successfully", user });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message || error });
    }
  }

  static async verifyEmail(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        otpCode: Joi.string().length(6).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.verifyEmail(value.email, value.otpCode);
      announceAdminQueueChanged();
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    });

    const { error } = schema.validate({ email, password });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const result = await AuthSvc.login({ email, password });
      // Cookies alongside the JSON body, not instead of it: the body is what
      // non-browser clients and the app's own server-side callers read.
      setSessionCookies(res, result);
      return res.json(result);
    } catch (e: unknown) {
      console.error("Login error:", e);

      // Only a genuine credential mismatch is a 401. This used to return 401
      // for *any* throw, so infrastructure failures were indistinguishable from
      // a wrong password - a missing database table once presented as "Invalid
      // credentials" and cost real debugging time.
      if (isCredentialFailure(e)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (isEmailVerificationFailure(e)) {
        return res.status(403).json({
          message: "Please verify your email before logging in.",
        });
      }

      return res.status(500).json({
        message: "Login failed. Please try again.",
      });
    }
  }

  static async refreshToken(req: Request, res: Response) {
    const { refreshToken } = req.body;

    const schema = Joi.object({
      refreshToken: Joi.string().required(),
    });

    const { error } = schema.validate({ refreshToken });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const result = await AuthSvc.refreshToken(refreshToken, {
        userAgent: req.get("user-agent") ?? undefined,
        ip: req.ip,
      });
      // `refreshToken` in the response is a NEW token — rotation made the one
      // the caller sent single-use. Clients must store this or their next
      // refresh fails. The cookies carry the same rotated pair, so a browser
      // session is extended without the client having to store anything.
      setSessionCookies(res, result);
      return res.json(result);
    } catch (e: unknown) {
      if (e instanceof RefreshTokenReuseError) {
        // Every session for the account has already been revoked by the time
        // this is thrown. Log it loudly: it is the signal that a refresh token
        // was copied, and it is the only place that signal exists.
        console.error(
          "[auth] Refresh token reuse detected — all sessions revoked.",
          { ip: req.ip, userAgent: req.get("user-agent") },
        );
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      if (e instanceof RefreshTokenError) {
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      // Not an auth failure. Answering 401 here is what made a missing table
      // look like a wrong password on the login path; do not repeat it.
      const error = e as Error;
      console.error("Refresh token error:", error);
      return res.status(500).json({ message: "Failed to refresh session" });
    }
  }

  static async forgotPassword(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.forgotPassword(value.email);

      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        message: error.message || "Failed to process request",
      });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        otpCode: Joi.string().length(6).required(),
        newPassword: Joi.string().min(6).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.resetPassword(
        value.email,
        value.otpCode,
        value.newPassword,
      );

      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        message: error.message || "Failed to reset password",
      });
    }
  }

  static async resendVerificationOTP(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.resendVerificationOTP(value.email);
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static googleRedirect(req: Request, res: Response) {
    // The frontend origin travels inside `state` (not a second cookie/param)
    // so it survives the round trip to Google and back automatically, and
    // the existing CSRF equality check on `state` covers it for free — the
    // callback only accepts the exact combined string this cookie holds.
    const csrf = GoogleAuthSvc.createState();
    const frontendOrigin = resolveFrontendOrigin(req);
    const state = `${csrf}|${Buffer.from(frontendOrigin).toString("base64url")}`;

    res.cookie(GOOGLE_STATE_COOKIE, state, GOOGLE_STATE_COOKIE_OPTIONS);
    return res.redirect(
      GoogleAuthSvc.getAuthUrl(state, resolveRedirectUri(req)),
    );
  }

  static async googleCallback(req: Request, res: Response) {
    const { code, state, error: googleError } = req.query;

    // One round trip, one use - cleared before anything can go wrong with it,
    // so a replayed callback cannot ride the same cookie twice.
    const expectedState = readCookie(req, GOOGLE_STATE_COOKIE);
    res.clearCookie(GOOGLE_STATE_COOKIE, {
      httpOnly: true,
      secure: !isDev,
      sameSite: "lax",
      path: "/api/v1/auth/google",
    });

    // Recovered from the cookie rather than the (unauthenticated,
    // Google-echoed) query `state` — this is the value this same server
    // handed out, so it's the one worth trusting for "where do I send this
    // browser back to" even before the CSRF equality check below runs.
    const frontendOrigin = originFromState(expectedState);

    if (googleError || typeof code !== "string") {
      return res.redirect(`${frontendOrigin}/?googleAuthError=1`);
    }

    // Without this the callback is not tied to the browser that started the
    // flow, and an attacker can hand a victim a callback URL bearing the
    // attacker's own code - signing the victim silently into the attacker's
    // account.
    if (
      typeof state !== "string" ||
      !expectedState ||
      !statesMatch(state, expectedState)
    ) {
      console.warn("Google sign-in rejected: state mismatch");
      return res.redirect(`${frontendOrigin}/?googleAuthError=1`);
    }

    try {
      const result = await GoogleAuthSvc.handleCallback(
        code,
        resolveRedirectUri(req),
      );

      // Only a reference travels in the URL. The tokens stay server-side until
      // the app collects them over POST and puts them straight into httpOnly
      // cookies, so neither one is ever written to history or a log.
      const exchangeCode = await GoogleAuthSvc.stashSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isNewUser: result.isNewUser,
        // Carried through so the exchange can set `fox_user` alongside the
        // token cookies, exactly as login does. Without it a Google session
        // would come back missing the profile cookie the app falls back to
        // when this API is unreachable - and the exchange would have to make a
        // second call to /profile to find out who had just signed in.
        user: result.user,
      });

      return res.redirect(
        `${frontendOrigin}/auth/google/callback?xc=${exchangeCode}`,
      );
    } catch (e: unknown) {
      console.error("Google sign-in error:", e);
      return res.redirect(`${frontendOrigin}/?googleAuthError=1`);
    }
  }

  /**
   * Mints a one-minute, single-use ticket for the socket handshake.
   *
   * Authenticated like any other route, so the caller proves itself with the
   * httpOnly cookie the app already holds; the ticket is what crosses into
   * client JavaScript, because a socket handshake cannot carry that cookie to
   * a different origin.
   */
  static async socketTicket(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const ticket = await issueSocketTicket({
        userId: req.user.userId,
        systemRole: req.user.systemRole,
      });
      return res.status(200).json({ data: { ticket } });
    } catch {
      return res
        .status(503)
        .json({ message: "Realtime updates are temporarily unavailable" });
    }
  }

  /**
   * Redeems the reference minted by `googleCallback`. Called once, server-side,
   * by the app's own callback route - never from the browser.
   */
  static async googleExchange(req: Request, res: Response) {
    const { code } = req.body ?? {};

    if (typeof code !== "string" || code.length === 0) {
      return res.status(400).json({ message: "Invalid exchange code" });
    }

    const session = await GoogleAuthSvc.redeemSession(code);
    if (!session) {
      // Expired, already redeemed, or never existed - all the same to the
      // caller, and worth keeping indistinguishable.
      return res.status(400).json({ message: "Invalid exchange code" });
    }

    setSessionCookies(res, session);
    return res.status(200).json({ data: session });
  }

  static async logout(req: Request, res: Response) {
    try {
      // Revokes the refresh token server-side so the session cannot be
      // extended. Previously this returned 200 without doing anything, which
      // meant a leaked refresh token stayed usable for its full lifetime.
      await AuthSvc.logout(req.body?.refreshToken);

      // Emitted even when no token was presented. Logout is idempotent, and a
      // caller with unreadable or already-dead cookies still wants them gone.
      clearSessionCookies(res);

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to logout",
      });
    }
  }
}
