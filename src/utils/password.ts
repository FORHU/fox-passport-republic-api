import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Single source of truth for password hashing.
 *
 * The codebase previously had two incompatible schemes in parallel:
 *   - `auth.service` wrote PBKDF2 as `"<hexSalt>:<hexHash>"`
 *   - `profile.service` / `users.service` wrote bcrypt
 *
 * Each verified with the *other* scheme's comparison, so change-password,
 * delete-account, and admin-created logins could never succeed. Everything now
 * goes through this module: new hashes are bcrypt, and `verifyPassword`
 * still accepts the legacy PBKDF2 format so existing users keep working.
 * Call `needsRehash` after a successful verify to upgrade the stored hash.
 */

const BCRYPT_COST = 12;

// Parameters the legacy PBKDF2 hashes were written with. Read-only — we never
// produce this format again, we only verify stored hashes that still use it.
const LEGACY_PBKDF2 = {
  iterations: 1000,
  keylen: 64,
  digest: "sha512",
} as const;

function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$/.test(stored);
}

function verifyLegacyPbkdf2(plain: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(":");
  if (!salt || !storedHash) return false;

  const computed = crypto.pbkdf2Sync(
    plain,
    salt,
    LEGACY_PBKDF2.iterations,
    LEGACY_PBKDF2.keylen,
    LEGACY_PBKDF2.digest,
  );

  let expected: Buffer;
  try {
    expected = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }

  // timingSafeEqual throws on length mismatch, so guard first.
  if (expected.length !== computed.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

/** Hash a new password. Always bcrypt. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verify a password against a stored hash in either the current (bcrypt) or
 * legacy (PBKDF2 `salt:hash`) format. Never throws on malformed input.
 */
export async function verifyPassword(
  plain: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!plain || !stored) return false;

  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }

  if (stored.includes(":")) return verifyLegacyPbkdf2(plain, stored);

  return false;
}

/**
 * True when a stored hash should be replaced after a successful verify —
 * either it is a legacy PBKDF2 hash, or bcrypt at a cost below current policy.
 */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!isBcryptHash(stored)) return true;

  const cost = Number.parseInt(stored.split("$")[2] ?? "", 10);
  return Number.isFinite(cost) && cost < BCRYPT_COST;
}
