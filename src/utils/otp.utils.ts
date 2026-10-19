import crypto from "crypto";
import redisUtil from "./redis.util";

/**
 * OTP UTILITIES
 * Reusable functions for One-Time Password operations
 * Used for: Email verification, phone verification, password reset
 */

/**
 * Math.random() is not a cryptographic source: its output is predictable to
 * anyone who observes enough of it, and an OTP that can be predicted is not a
 * second factor at all. randomInt draws from the same pool as the rest of the
 * crypto module.
 *
 * The range widens as a side effect. The old expression was
 * `100000 + random * 900000`, which can never produce a code below 100000 -
 * the leading digit was never zero, and the padStart below was dead code. Now
 * the whole 000000-999999 space is reachable and the padding is what makes a
 * low draw six digits long.
 */
export const generateOTP = (): string => {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
};

export const getOTPExpiry = (): Date => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 5);
  return expiry;
};

export const isOTPExpired = (expiry: Date | null): boolean => {
  if (!expiry) return true;
  return new Date() > expiry;
};

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_PREFIX = "otp:";

export const saveOTP = async (email: string, otp: string): Promise<void> => {
  const client = redisUtil.getClient();
  if (!client)
    throw new Error(
      "OTP service is temporarily unavailable. Please try again.",
    );
  await client.set(`${OTP_PREFIX}${email}`, otp, { EX: OTP_TTL_SECONDS });
};

// A wrong guess leaves the code in place, so a typo doesn't force a new email;
// guessing is capped by `otpVerifyRateLimit`. The code is deleted only on a
// match, and only the request whose `del` removed it wins - so it stays
// single-use even when two correct submissions race.
export const verifyOTP = async (
  email: string,
  otp: string,
): Promise<boolean> => {
  const client = redisUtil.getClient();
  if (!client)
    throw new Error(
      "OTP service is temporarily unavailable. Please try again.",
    );
  const key = `${OTP_PREFIX}${email}`;
  const stored = await client.get(key);
  if (stored !== otp) return false;
  return (await client.del(key)) === 1;
};

export const deleteOTP = async (email: string): Promise<void> => {
  const client = redisUtil.getClient();
  if (!client) return;
  await client.del(`${OTP_PREFIX}${email}`);
};
