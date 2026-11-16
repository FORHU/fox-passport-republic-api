import { describe, it, expect, vi } from "vitest";
import { constructStripeEvent } from "../src/utils/stripe-webhook";

/**
 * api#363: Stripe signs each webhook endpoint with its own secret, and sends
 * events on connected (Foxer) accounts only to a Connect endpoint. Both post
 * to one route, so either secret must verify.
 */
describe("constructStripeEvent", () => {
  const PLATFORM = "whsec_platform";
  const CONNECT = "whsec_connect";

  // Stands in for stripe.webhooks.constructEvent: a body "signed" with a
  // secret verifies only against that secret.
  const webhooks = {
    constructEvent: vi.fn(
      (
        payload: string | Buffer,
        signature: string | string[],
        secret: string,
      ) => {
        if (signature !== `signed-with:${secret}`) {
          throw new Error(
            "No signatures found matching the expected signature",
          );
        }
        return { id: "evt_1", type: "account.updated", payload } as never;
      },
    ),
  };

  it("verifies an event signed by the platform endpoint", () => {
    const event = constructStripeEvent(
      webhooks,
      "{}",
      `signed-with:${PLATFORM}`,
      [PLATFORM, CONNECT],
    );
    expect(event).toMatchObject({ id: "evt_1" });
  });

  it("verifies an event signed by the Connect endpoint", () => {
    const event = constructStripeEvent(
      webhooks,
      "{}",
      `signed-with:${CONNECT}`,
      [PLATFORM, CONNECT],
    );
    expect(event).toMatchObject({ id: "evt_1" });
  });

  it("refuses an event that matches neither secret, with Stripe's reason", () => {
    expect(() =>
      constructStripeEvent(webhooks, "{}", "signed-with:whsec_other", [
        PLATFORM,
        CONNECT,
      ]),
    ).toThrow(/No signatures found/);
  });

  it("refuses a Connect event when only the platform secret is set", () => {
    expect(() =>
      constructStripeEvent(webhooks, "{}", `signed-with:${CONNECT}`, [
        PLATFORM,
        undefined,
      ]),
    ).toThrow(/No signatures found/);
  });

  it("refuses everything when no secret is configured", () => {
    expect(() =>
      constructStripeEvent(webhooks, "{}", `signed-with:${PLATFORM}`, [
        undefined,
        " ",
      ]),
    ).toThrow(/No Stripe webhook secret is configured/);
  });
});
