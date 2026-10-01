import crypto from "crypto";
import jwt from "jsonwebtoken";
import axios from "axios";
import { RoleType, SystemRole } from "@prisma/client";
import AuthRepo from "./auth.repository";
import { prisma } from "../../utils/prisma";
import redisUtil from "../../utils/redis.util";
import { issueRefreshToken, revokeAllForUser } from "./refresh-token.service";
import { hashPassword } from "../../utils/password";
import { permissionsForUser } from "../../types/permissions";
import {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY,
} from "../../config";

interface PendingSession {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user?: Record<string, unknown>;
}

const EXCHANGE_PREFIX = "facebook:exchange:";
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

export default class FacebookAuthSvc {
  static createState(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  static getAuthUrl(state: string, redirectUri: string): string {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      throw new Error("Facebook OAuth is not configured on this server");
    }

    const params = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      state,
      scope: "public_profile,email",
      response_type: "code",
    });

    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  static async handleCallback(code: string, redirectUri: string) {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      throw new Error("Facebook OAuth is not configured on this server");
    }

    // Exchange authorization code for Facebook access token
    const tokenRes = await axios.get(
      "https://graph.facebook.com/v21.0/oauth/access_token",
      {
        params: {
          client_id: FACEBOOK_APP_ID,
          client_secret: FACEBOOK_APP_SECRET,
          redirect_uri: redirectUri,
          code,
        },
      },
    );

    const fbAccessToken = tokenRes.data?.access_token;
    if (!fbAccessToken) {
      throw new Error("Facebook did not return an access token");
    }

    // Compute appsecret_proof for secure Graph API communication
    const appsecretProof = crypto
      .createHmac("sha256", FACEBOOK_APP_SECRET)
      .update(fbAccessToken)
      .digest("hex");

    // Retrieve verified profile details
    const profileRes = await axios.get("https://graph.facebook.com/v21.0/me", {
      params: {
        fields: "id,name,first_name,last_name,email,picture.type(large)",
        access_token: fbAccessToken,
        appsecret_proof: appsecretProof,
      },
    });

    const profile = profileRes.data;
    if (!profile?.id) {
      throw new Error("Facebook did not return a valid user profile");
    }

    const email = (profile.email || `fb_${profile.id}@foxpassport.com`)
      .toLowerCase()
      .trim();
    const name = profile.name || profile.first_name || email.split("@")[0];

    const existing = await AuthRepo.findUserByEmail(email);
    let user: {
      id: string;
      email: string;
      username: string | null;
      name: string;
      systemRole?: SystemRole;
      roleType?: RoleType[];
    };
    let isNewUser = false;

    if (!existing) {
      const username = await uniqueUsernameFromEmail(email);
      const randomPassword = await hashPassword(
        crypto.randomBytes(32).toString("hex"),
      );

      user = await prisma.user.create({
        data: {
          email,
          name,
          username,
          password: randomPassword,
          isEmailVerified: true,
          updatedAt: new Date(),
        },
      });
      isNewUser = true;
    } else {
      user = existing;
      if (!existing.isEmailVerified) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { isEmailVerified: true },
        });
      }
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
        email: user.email,
        permissions: permissionsForUser(user),
      },
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    await revokeAllForUser(user.id);
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
        permissions: permissionsForUser(user),
      },
    };
  }

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
