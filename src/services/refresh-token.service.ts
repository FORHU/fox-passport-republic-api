import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import { REFRESH_TOKEN_SECRET, REFRESH_TOKEN_EXPIRY } from "../config";

/**
 * Refresh-token lifecycle.
 *
 * Refresh used to be a bare `jwt.verify` with nothing persisted, so logout could
 * not end a session and a leaked token stayed valid for its whole lifetime.
 * Every refresh token now carries a `jti` recorded in the database, and
 * verification checks that record. Logout revokes it.
 *
 * Only the jti is stored, never the token: enough to revoke, useless to anyone
 * who reads the table.
 */

/**
 * Honour REFRESH_TOKEN_EXPIRY from config rather than hardcoding. A hardcoded
 * 30 days here silently overrode the configured 7d and handed out tokens four
 * times longer-lived than intended.
 */
function refreshTokenTtlMs(): number {
  const raw = String(REFRESH_TOKEN_EXPIRY ?? "7d").trim();
  const match = /^(\d+)\s*([smhd])$/.exec(raw);
  if (!match) return 7 * 24 * 60 * 60 * 1000;

  const value = Number(match[1]);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as "s" | "m" | "h" | "d"
  ];
  return value * unit;
}

export interface RefreshTokenClaims {
  userId: string;
  jti: string;
}

/** Sign a refresh token and record its jti so it can later be revoked. */
export async function issueRefreshToken(
  userId: string,
  context?: { userAgent?: string; ip?: string },
): Promise<string> {
  const jti = crypto.randomUUID();
  const ttlMs = refreshTokenTtlMs();
  const expiresAt = new Date(Date.now() + ttlMs);

  // The DB row and the JWT must expire together, or one outlives the other and
  // the two disagree about whether the session is alive.
  const token = jwt.sign({ userId, jti }, REFRESH_TOKEN_SECRET, {
    expiresIn: Math.floor(ttlMs / 1000),
  });

  await prisma.refreshToken.create({
    data: {
      jti,
      userId,
      expiresAt,
      userAgent: context?.userAgent?.slice(0, 255),
      ip: context?.ip,
    },
  });

  return token;
}

/**
 * Verify a refresh token's signature *and* that it has not been revoked.
 *
 * A token whose jti is missing from the table is treated as invalid. That is
 * deliberate: it covers both revoked tokens and any token minted before this
 * table existed, so old long-lived tokens stop working rather than quietly
 * bypassing revocation.
 */
export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenClaims> {
  const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as {
    userId?: string;
    jti?: string;
  };

  if (!decoded?.userId || !decoded?.jti) {
    throw new Error("Invalid refresh token");
  }

  const record = await prisma.refreshToken.findUnique({
    where: { jti: decoded.jti },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new Error("Invalid refresh token");
  }

  return { userId: decoded.userId, jti: decoded.jti };
}

/** Revoke one token. Used by logout; safe to call on an unknown jti. */
export async function revokeRefreshToken(jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every live session for a user - password change, or suspected theft. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
