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

export interface IssueContext {
  userAgent?: string;
  ip?: string;
}

/**
 * A refresh token that cannot be used: bad signature, unknown jti, expired, or
 * revoked by logout. Ordinary — the caller should answer 401.
 */
export class RefreshTokenError extends Error {
  constructor(message = "Invalid refresh token") {
    super(message);
    this.name = "RefreshTokenError";
  }
}

/**
 * A token that had already been *rotated* was presented again, outside the
 * race window. The legitimate holder swapped it for a successor, so whoever
 * sent this one is holding a copy. Every session for the account is revoked
 * before this is thrown.
 */
export class RefreshTokenReuseError extends RefreshTokenError {
  constructor(message = "Refresh token reuse detected") {
    super(message);
    this.name = "RefreshTokenReuseError";
  }
}

/**
 * How long after a rotation the superseded token is still tolerated.
 *
 * Two requests can legitimately present the same refresh token at the same
 * moment — parallel calls through the Next proxy both hit 401 and both refresh.
 * Without a window that reads as theft and signs the user out for doing nothing
 * wrong. Sixty seconds is far longer than any such race and far shorter than
 * the window an attacker needs for a stolen token to be useful.
 */
const ROTATION_GRACE_MS = 60_000;

/** Sign a refresh token and record its jti so it can later be revoked. */
export async function issueRefreshToken(
  userId: string,
  context?: IssueContext,
): Promise<string> {
  const { token } = await mintRefreshToken(userId, context);
  return token;
}

/** As `issueRefreshToken`, but also returns the jti so a rotation can link to it. */
async function mintRefreshToken(
  userId: string,
  context?: IssueContext,
): Promise<{ token: string; jti: string }> {
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

  return { token, jti };
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

/**
 * Exchange a refresh token for a successor, single-use.
 *
 * Rotation is what makes a stolen refresh token *detectable* rather than merely
 * time-limited. Without it a copied token works silently for its full lifetime
 * alongside the real one; with it, the first of the two to refresh invalidates
 * the other, and the loser presenting the dead token is evidence that a copy
 * exists.
 *
 * Three outcomes:
 *  - live token          → revoked, successor issued, linked by `replacedByJti`
 *  - rotated < 60s ago   → a parallel-request race, not theft: a successor is
 *                          issued anyway rather than signing the user out
 *  - rotated > 60s ago   → reuse. Every session for the account is revoked and
 *                          `RefreshTokenReuseError` is thrown.
 *
 * A token revoked by logout or a password change has no `rotatedAt`, so it
 * fails as an ordinary dead token and never trips theft detection.
 */
export async function rotateRefreshToken(
  token: string,
  context?: IssueContext,
): Promise<{ userId: string; refreshToken: string }> {
  let decoded: { userId?: string; jti?: string };
  try {
    decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as {
      userId?: string;
      jti?: string;
    };
  } catch {
    throw new RefreshTokenError();
  }

  if (!decoded?.userId || !decoded?.jti) throw new RefreshTokenError();
  const jti = decoded.jti;

  const record = await prisma.refreshToken.findUnique({ where: { jti } });
  if (!record) throw new RefreshTokenError();
  if (record.expiresAt < new Date()) throw new RefreshTokenError();

  // Claim the rotation atomically. `revokedAt: null` in the filter means only
  // one of N concurrent callers can win, so two parallel refreshes cannot both
  // believe they superseded the same token.
  const now = new Date();
  const claimed = await prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: now, rotatedAt: now },
  });

  if (claimed.count === 0) {
    // Someone got there first, or the token was already dead. Re-read to find
    // out which — the distinction is the whole point of `rotatedAt`.
    const settled = await prisma.refreshToken.findUnique({ where: { jti } });

    if (!settled?.rotatedAt) {
      // Revoked by logout or a password change. Ordinary, not suspicious.
      throw new RefreshTokenError();
    }

    if (Date.now() - settled.rotatedAt.getTime() > ROTATION_GRACE_MS) {
      await revokeAllForUser(settled.userId);
      throw new RefreshTokenReuseError();
    }

    // Inside the window: a genuine race. Fall through and issue a successor.
  }

  const successor = await mintRefreshToken(record.userId, context);

  if (claimed.count === 1) {
    await prisma.refreshToken.update({
      where: { jti },
      data: { replacedByJti: successor.jti },
    });
  }

  return { userId: record.userId, refreshToken: successor.token };
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
