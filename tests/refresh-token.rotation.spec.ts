import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rotation is what turns a stolen refresh token from "valid for seven days"
 * into "detectable the moment either copy is used twice". These tests pin the
 * three outcomes that behaviour depends on, because two of them are easy to
 * regress into silently signing people out.
 */

vi.mock("../src/config", () => ({
  REFRESH_TOKEN_SECRET: "test-refresh-secret",
  REFRESH_TOKEN_EXPIRY: "7d",
}));

interface Row {
  id: string;
  jti: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedAt: Date | null;
  replacedByJti: string | null;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}

const rows = new Map<string, Row>();

// A stand-in for the two Prisma calls this service makes. Small enough to keep
// honest, and it means these tests need no database.
vi.mock("../src/utils/prisma", () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `id-${data.jti}`,
          jti: data.jti!,
          userId: data.userId!,
          expiresAt: data.expiresAt!,
          revokedAt: null,
          rotatedAt: null,
          replacedByJti: null,
          createdAt: new Date(),
          userAgent: data.userAgent ?? null,
          ip: data.ip ?? null,
        };
        rows.set(row.jti, row);
        return row;
      }),

      findUnique: vi.fn(async ({ where }: { where: { jti: string } }) => {
        return rows.get(where.jti) ?? null;
      }),

      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { jti: string };
          data: Partial<Row>;
        }) => {
          const row = rows.get(where.jti);
          if (!row) throw new Error("not found");
          Object.assign(row, data);
          return row;
        },
      ),

      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { jti?: string; userId?: string; revokedAt?: null };
          data: Partial<Row>;
        }) => {
          let count = 0;
          for (const row of rows.values()) {
            if (where.jti !== undefined && row.jti !== where.jti) continue;
            if (where.userId !== undefined && row.userId !== where.userId)
              continue;
            if (where.revokedAt === null && row.revokedAt !== null) continue;
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
      ),
    },
  },
}));

import {
  issueRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  RefreshTokenError,
  RefreshTokenReuseError,
} from "../src/services/refresh-token.service";

const USER = "user-1";

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("rotateRefreshToken", () => {
  it("issues a successor and kills the token it was given", async () => {
    const original = await issueRefreshToken(USER);

    const { refreshToken: successor, userId } =
      await rotateRefreshToken(original);

    expect(userId).toBe(USER);
    expect(successor).not.toBe(original);

    // The successor works...
    await expect(verifyRefreshToken(successor)).resolves.toMatchObject({
      userId: USER,
    });

    // ...and the one it replaced does not. This is the single-use property.
    await expect(verifyRefreshToken(original)).rejects.toThrow();
  });

  it("links the dead token to its replacement", async () => {
    const original = await issueRefreshToken(USER);
    const { refreshToken: successor } = await rotateRefreshToken(original);

    const dead = [...rows.values()].find((r) => r.revokedAt !== null)!;
    const live = [...rows.values()].find((r) => r.revokedAt === null)!;

    expect(dead.rotatedAt).toBeInstanceOf(Date);
    expect(dead.replacedByJti).toBe(live.jti);
    await expect(verifyRefreshToken(successor)).resolves.toBeTruthy();
  });

  it("tolerates two parallel refreshes of the same token", async () => {
    // Two requests both hit 401 and both spend the same cookie. That is a race,
    // not theft — signing the user out here would be a bug caused by the
    // security feature rather than prevented by it.
    const original = await issueRefreshToken(USER);

    const [a, b] = await Promise.all([
      rotateRefreshToken(original),
      rotateRefreshToken(original),
    ]);

    expect(a.refreshToken).not.toBe(b.refreshToken);
    await expect(verifyRefreshToken(a.refreshToken)).resolves.toBeTruthy();
    await expect(verifyRefreshToken(b.refreshToken)).resolves.toBeTruthy();
  });

  it("treats reuse after the grace window as theft and ends every session", async () => {
    const original = await issueRefreshToken(USER);
    const other = await issueRefreshToken(USER); // a second device
    const { refreshToken: successor } = await rotateRefreshToken(original);

    // Push the rotation out of the 60-second race window.
    const rotated = [...rows.values()].find((r) => r.rotatedAt !== null)!;
    rotated.rotatedAt = new Date(Date.now() - 120_000);

    await expect(rotateRefreshToken(original)).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );

    // Everything for that account is now dead — including the successor the
    // legitimate holder was using, and the unrelated second device.
    await expect(verifyRefreshToken(successor)).rejects.toThrow();
    await expect(verifyRefreshToken(other)).rejects.toThrow();
  });

  it("does not cry theft over a token revoked by logout", async () => {
    // Logout leaves revokedAt set but rotatedAt null. A stale tab presenting it
    // is ordinary, and must not nuke sessions the user still wants.
    const original = await issueRefreshToken(USER);
    const survivor = await issueRefreshToken(USER);

    const { jti } = await verifyRefreshToken(original);
    await revokeRefreshToken(jti);

    const error = await rotateRefreshToken(original).catch((e) => e);
    expect(error).toBeInstanceOf(RefreshTokenError);
    expect(error).not.toBeInstanceOf(RefreshTokenReuseError);

    // The other session is untouched.
    await expect(verifyRefreshToken(survivor)).resolves.toBeTruthy();
  });

  it("rejects an unknown or forged token without touching the table", async () => {
    await expect(rotateRefreshToken("not-a-jwt")).rejects.toBeInstanceOf(
      RefreshTokenError,
    );
    expect(rows.size).toBe(0);
  });

  it("rejects an expired token", async () => {
    const token = await issueRefreshToken(USER);
    const row = [...rows.values()][0];
    row.expiresAt = new Date(Date.now() - 1000);

    await expect(rotateRefreshToken(token)).rejects.toBeInstanceOf(
      RefreshTokenError,
    );
  });
});
