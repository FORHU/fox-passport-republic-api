import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
} from "../src/utils/password";

/** Reproduces the legacy PBKDF2 format that `auth.service` used to write. */
function legacyPbkdf2Hash(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(plain, salt, 1000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

describe("password hashing", () => {
  it("round-trips a newly hashed password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("produces bcrypt hashes at the configured cost", async () => {
    const stored = await hashPassword("whatever");
    expect(stored).toMatch(/^\$2[aby]\$12\$/);
  });

  it("salts each hash independently", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
  });

  // The migration path: users who registered before hashing was unified still
  // have PBKDF2 hashes in the database and must keep being able to log in.
  describe("legacy PBKDF2 hashes", () => {
    it("verifies a correct password against a legacy hash", async () => {
      const stored = legacyPbkdf2Hash("legacy-secret");
      expect(await verifyPassword("legacy-secret", stored)).toBe(true);
    });

    it("rejects a wrong password against a legacy hash", async () => {
      const stored = legacyPbkdf2Hash("legacy-secret");
      expect(await verifyPassword("not-the-password", stored)).toBe(false);
    });

    it("flags legacy hashes for rehashing", () => {
      expect(needsRehash(legacyPbkdf2Hash("legacy-secret"))).toBe(true);
    });
  });

  describe("needsRehash", () => {
    it("does not flag a current-cost bcrypt hash", async () => {
      expect(needsRehash(await hashPassword("fresh"))).toBe(false);
    });

    it("flags a bcrypt hash below the current cost", () => {
      // A real bcrypt hash written at cost 10, the previous value.
      expect(
        needsRehash(
          "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        ),
      ).toBe(true);
    });

    it("ignores empty input", () => {
      expect(needsRehash("")).toBe(false);
      expect(needsRehash(null)).toBe(false);
    });
  });

  describe("malformed input", () => {
    it("returns false rather than throwing", async () => {
      expect(await verifyPassword("x", "")).toBe(false);
      expect(await verifyPassword("x", null)).toBe(false);
      expect(await verifyPassword("x", "not-a-hash")).toBe(false);
      expect(await verifyPassword("x", "only:one-half")).toBe(false);
      expect(await verifyPassword("", "$2b$12$abcdefg")).toBe(false);
    });
  });
});
