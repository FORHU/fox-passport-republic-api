import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import AuthRepo from "../repositories/auth.repository";
import { issueRefreshToken } from "./refresh-token.service";
import { hashPassword } from "../utils/password";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY,
} from "../config";

const client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
);

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
  static getAuthUrl(): string {
    return client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
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
      },
    };
  }
}
