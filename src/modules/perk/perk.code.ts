import crypto from "node:crypto";
import { CODE_WINDOW_SECONDS } from "./perk.constants";

// No 0, O, 1, I or L: a code read out loud or typed at a door is not mixed up.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** The text code staff can type: `FP-XXXX-XXXX`. */
export function newPerkCode(): string {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const part = () => Array.from({ length: 4 }, pick).join("");
  return `FP-${part()}-${part()}`;
}

/** Derives the live code; never leaves the server. */
export function newPerkSecret(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Which 30-second window a moment falls in. */
export function windowOf(now: Date): number {
  return Math.floor(now.getTime() / 1000 / CODE_WINDOW_SECONDS);
}

/** Seconds until the live code changes. */
export function secondsLeftInWindow(now: Date): number {
  const elapsed = (now.getTime() / 1000) % CODE_WINDOW_SECONDS;
  return Math.max(1, Math.ceil(CODE_WINDOW_SECONDS - elapsed));
}

function mac(secret: string, code: string, window: number): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${code}:${window}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * What the QR carries: the text code, the window and a signature of both, so
 * a copy of an old one fails and a made-up one cannot be signed.
 */
export function liveCode(secret: string, code: string, now: Date): string {
  const window = windowOf(now);
  return `${code}.${window}.${mac(secret, code, window)}`;
}

/**
 * True for the current window and the one before it (a scan that straddles the
 * change still works), false for anything older, newer or tampered with.
 */
export function verifyLiveCode(
  secret: string,
  code: string,
  live: string,
  now: Date,
): boolean {
  const [liveCodePart, windowPart, signature] = live.split(".");
  if (liveCodePart !== code || !windowPart || !signature) return false;
  const window = Number(windowPart);
  const current = windowOf(now);
  if (
    !Number.isInteger(window) ||
    (window !== current && window !== current - 1)
  ) {
    return false;
  }
  const expected = mac(secret, code, window);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
