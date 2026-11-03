import Joi from "joi";

// The one username rule: lowercase letters, numbers, `.` and `_`, 3–30 long.
// Kept in step with the web's usernameSchema (shared/lib/schema.ts).
export const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;
export const USERNAME_MESSAGE =
  "Usernames need 3–30 characters and can only use letters, numbers, dots and underscores.";

/** Joi rule for a username: trimmed, lowercased, then pattern-checked. */
export const usernameJoi = () =>
  Joi.string()
    .trim()
    .lowercase()
    .pattern(USERNAME_PATTERN)
    .messages({ "string.pattern.base": USERNAME_MESSAGE });

/** The normalized username, or null when it breaks the rule. */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}
