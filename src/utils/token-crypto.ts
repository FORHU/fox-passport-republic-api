import crypto from "crypto";

/**
 * Encrypts third-party access tokens (Facebook Page and user tokens) before
 * they are stored. AES-256-GCM, so a changed ciphertext fails to decrypt
 * instead of yielding a different token. Stored as
 * `v1:<iv>:<auth tag>:<ciphertext>`, each part base64; the version lets the
 * key or algorithm change later without guessing what an old row holds.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("The token encryption key must be 32 bytes, base64.");
  }
  return key;
}

export function encryptToken(plain: string, base64Key: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(":");
}

/** Throws when the value was not made by `encryptToken` with this key. */
export function decryptToken(stored: string, base64Key: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unrecognised encrypted token format.");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    keyFrom(base64Key),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
