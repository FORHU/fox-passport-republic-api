/**
 * Boot-time validation for values the app cannot safely run without.
 *
 * Nothing checked these. `ACCESS_TOKEN_SECRET` was a bare `as string` cast, so
 * a deployment missing it started up cleanly and then 500'd every login - the
 * failure surfaced as far as possible from its cause. Worse, an environment
 * carrying a leftover development value ("accesssecret123", which is committed
 * in `tests/setup.ts` and therefore public) also started up perfectly happily,
 * and anyone reading the repo could mint an access token for any userId with
 * `systemRole: "admin"`.
 *
 * Refusing to boot is the correct failure for both. It is loud, it happens at
 * deploy time rather than at first login, and it cannot be missed.
 */

/** Values that are obviously not real secrets, however long they are. */
const PLACEHOLDER =
  /^(change[_-]?me|placeholder|secret|password|test|dev|example|todo)$/i;
const SUFFIXED_PLACEHOLDER = /_change_in_production$/i;

/**
 * Production secrets shorter than this are rejected. 32 characters is the
 * floor for an HMAC key that is not worth brute-forcing; the dev values in this
 * repo are half that.
 */
export const MIN_SECRET_LENGTH = 32;

export interface RequireSecretOptions {
  /** When false, strength is enforced as well as presence. */
  isDev: boolean;
}

export function requireSecret(
  name: string,
  value: string | undefined,
  { isDev }: RequireSecretOptions,
): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is not set. Refusing to start: every token this process ` +
        `issues or verifies depends on it.`,
    );
  }

  // Development runs on the committed dev values by design, so presence is all
  // that is checked there. Production is where a weak secret is exploitable.
  if (isDev) return value;

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is ${value.length} characters. Refusing to start in ` +
        `production: at least ${MIN_SECRET_LENGTH} are required, and a short ` +
        `secret lets anyone who guesses it mint an admin token.`,
    );
  }

  if (PLACEHOLDER.test(value.trim()) || SUFFIXED_PLACEHOLDER.test(value)) {
    throw new Error(
      `${name} is still a placeholder value. Refusing to start in production.`,
    );
  }

  return value;
}
