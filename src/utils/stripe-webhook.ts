import type Stripe from "stripe";

/**
 * Verifies a Stripe webhook against every signing secret this API accepts.
 *
 * Stripe signs each webhook endpoint with its own secret, and events about
 * connected (Foxer) accounts, such as `account.updated` when onboarding
 * finishes, are only sent to a Connect endpoint. Both endpoints post to the
 * same route, so a request is genuine when it matches either secret: the
 * platform endpoint's (`STRIPE_WEBHOOK_SECRET`) or the Connect endpoint's
 * (`STRIPE_CONNECT_WEBHOOK_SECRET`). Checking only the first is how Connect
 * events were refused and onboarding never registered.
 *
 * Throws when no secret is configured, or when none matches; the error of the
 * last attempt is rethrown, so the caller's 400 names Stripe's own reason.
 */
export function constructStripeEvent(
  webhooks: Pick<Stripe["webhooks"], "constructEvent">,
  payload: string | Buffer,
  signature: string | string[],
  secrets: ReadonlyArray<string | undefined>,
): Stripe.Event {
  const configured = secrets
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);
  if (configured.length === 0) {
    throw new Error("No Stripe webhook secret is configured");
  }

  let lastError: unknown;
  for (const secret of configured) {
    try {
      return webhooks.constructEvent(payload, signature, secret);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
