import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import AuthRepo from "./auth.repository";
import redisUtil from "../../utils/redis.util";
import { issueRefreshToken } from "./refresh-token.service";
import { hashPassword } from "../../utils/password";
import { permissionsForUser } from "../../types/permissions";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY,
} from "../../config";

const client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
);

/**
 * A completed Google sign-in, parked server-side between the callback and the
 * app collecting it.
 */
interface PendingSession {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

const EXCHANGE_PREFIX = "google:exchange:";
// Long enough for one redirect and the app's server-side collection, short
// enough that an abandoned sign-in leaves nothing usable behind.
const EXCHANGE_TTL_SECONDS = 60;

/** Turns an email local-part into a unique, database-safe username. */
async function uniqueUsernameFromEmail(email: string): Promise<string> {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "user";

  let candidate = base;
  while (await AuthRepo.findUserByUsername(candidate)) {
    candidate = `${base}${crypto.randomInt(1000, 9999)}`;
  }
  return candidate;
}

export default class GoogleAuthSvc {
  /**
   * A single-use, unguessable value tying a callback back to the browser that
   * started the flow. The caller stores it in an httpOnly cookie and compares
   * it with the `state` Google echoes back; without that pairing an attacker
   * can complete the flow in someone else's browser and land them in an
   * attacker-controlled account.
   */
  static createState(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  static getAuthUrl(state: string): string {
    return client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state,
    });
  }

  /**
   * Exchanges the authorization code for tokens, verifies the ID token, and
   * finds-or-creates the local user. Mirrors AuthSvc.login's token issuance so
   * the two flows are interchangeable to the rest of the app.
   */
  static async handleCallback(code: string) {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new Error("Google did not return an ID token");
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new Error("Google account is missing required profile data");
    }

    // Everything below keys off the email: it decides whether this identity is
    // linked to an existing password account, and the new row is written with
    // `isEmailVerified: true`. An unverified address makes both of those a
    // claim rather than a fact - on a Workspace domain an administrator can set
    // one arbitrarily - so the whole flow stops here unless Google vouches for
    // it.
    if (payload.email_verified !== true) {
      throw new Error("Google account email is not verified");
    }

    const { sub: googleId, email, name } = payload;

    let user = await AuthRepo.findUserByGoogleId(googleId);
    let isNewUser = false;

    if (!user) {
      const existingByEmail = await AuthRepo.findUserByEmail(email);

      if (existingByEmail) {
        // Same email already registered (password signup) — link the
        // Google identity to that account rather than creating a duplicate.
        user = await AuthRepo.linkGoogleId(existingByEmail.id, googleId);
      } else {
        const username = await uniqueUsernameFromEmail(email);
        // Google users never log in with a password, but the column is
        // NOT NULL — a random, never-communicated hash fills it.
        const randomPassword = await hashPassword(
          crypto.randomBytes(32).toString("hex"),
        );

        user = await AuthRepo.createGoogleUser({
          email,
          name: name || email.split("@")[0],
          username,
          password: randomPassword,
          googleId,
        });
        isNewUser = true;
      }
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
        email: user.email,
        // Carried in the token so the app's edge middleware can gate /admin
        // without a round trip. The API never trusts this - `can()` always
        // re-derives from the role - it is a convenience for the client.
        permissions: permissionsForUser(user),
      },
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshToken = await issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
        // The client is told its capabilities rather than deriving them: the
        // app holds no grant table, so this is the only place it can learn
        // what to render. Never read back by the API - `can()` re-derives.
        permissions: permissionsForUser(user),
      },
    };
  }

  /**
   * Parks a completed sign-in behind an opaque, single-use code.
   *
   * The tokens used to travel to the app as query parameters on a redirect,
   * which put a *refresh* token - the long-lived credential the rest of the
   * system rotates and treats as detectable on theft - into browser history,
   * the `Referer` on the next request, and every access log along the way.
   * What travels now is a reference that is useless a minute later and cannot
   * be redeemed twice.
   *
   * Redis is optional elsewhere in this app; here it is not. Sign-in fails
   * rather than falling back to putting the credential in a URL.
   */
  static async stashSession(session: PendingSession): Promise<string> {
    const client = redisUtil.getClient();
    if (!client) {
      throw new Error("Sign-in is temporarily unavailable");
    }

    const code = crypto.randomBytes(32).toString("hex");
    await client.set(`${EXCHANGE_PREFIX}${code}`, JSON.stringify(session), {
      EX: EXCHANGE_TTL_SECONDS,
    });
    return code;
  }

  /**
   * Redeems a code exactly once. `getDel` is atomic, so two racing requests
   * cannot both walk away with the same session - the same reason the OTP
   * helper uses it.
   */
  static async redeemSession(code: string): Promise<PendingSession | null> {
    const client = redisUtil.getClient();
    if (!client) return null;

    const raw = await client.getDel(`${EXCHANGE_PREFIX}${code}`);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as PendingSession;
    } catch {
      return null;
    }
  }
}
