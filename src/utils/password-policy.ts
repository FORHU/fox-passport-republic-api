import Joi from "joi";

// The one password policy: 12–128 characters, with an uppercase letter, a
// lowercase letter, a digit and a special character (anything but a letter,
// digit or whitespace). Enforced on every route that sets a password: Better
// Auth's sign-up, reset and change-password (hooks in better-auth.ts), the
// custom /profile/change-password, and admin create/update user. Kept in step
// with the web's shared/lib/passwordPolicy.ts (BUG-27).
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const RULES: ReadonlyArray<{ test: RegExp; message: string }> = [
  {
    test: /[A-Z]/,
    message: "Password must contain at least one uppercase letter",
  },
  {
    test: /[a-z]/,
    message: "Password must contain at least one lowercase letter",
  },
  { test: /\d/, message: "Password must contain at least one digit" },
  {
    test: /[^A-Za-z0-9\s]/,
    message: "Password must contain at least one special character",
  },
];

/** The first rule a password breaks, or null when it meets the policy. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Password must be at most ${PASSWORD_MAX} characters`;
  }
  return RULES.find((r) => !r.test.test(password))?.message ?? null;
}

/** Joi rule for a new password; the error message names the broken rule. */
export const passwordJoi = () =>
  Joi.string()
    .custom((value: string, helpers) => {
      const error = passwordPolicyError(value);
      return error ? helpers.message({ custom: error }) : value;
    })
    .messages({
      "string.empty": `Password must be at least ${PASSWORD_MIN} characters`,
    });
