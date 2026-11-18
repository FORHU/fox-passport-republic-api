/**
 * Boot-time check for the Stripe settings payments can't run without.
 *
 * `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` used to be bare `as string`
 * casts, and every Stripe client was built with `STRIPE_SECRET_KEY || ""`. A
 * production deploy missing either started cleanly, then failed at the first
 * checkout, or answered every webhook with a 400 so no payment was ever
 * confirmed. In production that is now a refusal to start; development and
 * tests run without Stripe keys, so there it is only a warning.
 */

/** The prefix each Stripe value must start with. */
const PREFIXES: Record<string, readonly string[]> = {
  // Secret keys are `sk_live_…`/`sk_test_…`; restricted keys are `rk_…`.
  STRIPE_SECRET_KEY: ["sk_", "rk_"],
  STRIPE_WEBHOOK_SECRET: ["whsec_"],
  STRIPE_CONNECT_WEBHOOK_SECRET: ["whsec_"],
};

export interface StripeEnvOptions {
  /** Production refuses to start; development only warns. */
  isDev: boolean;
  /** An optional setting may be unset; when set, it must still be well formed. */
  optional?: boolean;
}

export function readStripeEnv(
  name: string,
  value: string | undefined,
  { isDev, optional = false }: StripeEnvOptions,
): string {
  const trimmed = value?.trim() ?? "";
  const prefixes = PREFIXES[name] ?? [];

  let problem: string | null = null;
  if (trimmed === "") {
    if (!optional) problem = `${name} is not set`;
  } else if (prefixes.length && !prefixes.some((p) => trimmed.startsWith(p))) {
    problem = `${name} doesn't look like a Stripe value (expected it to start with ${prefixes.join(" or ")})`;
  }

  if (problem) {
    if (!isDev) {
      throw new Error(`${problem}. Refusing to start in production.`);
    }
    // Development and tests run without Stripe; say so once, at startup.
    if (process.env.NODE_ENV !== "test") {
      console.warn(`⚠️ ${problem}. Stripe calls will fail.`);
    }
  }

  return trimmed;
}
