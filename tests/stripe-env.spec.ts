import { describe, it, expect, vi, afterEach } from "vitest";
import { readStripeEnv } from "../src/utils/stripe-env";

/**
 * api#363: the Stripe keys were bare `as string` casts, so a production deploy
 * without them started cleanly and failed at the first payment or webhook.
 */
describe("readStripeEnv", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a well-formed value, trimmed", () => {
    expect(
      readStripeEnv("STRIPE_SECRET_KEY", " sk_test_abc ", { isDev: false }),
    ).toBe("sk_test_abc");
    expect(
      readStripeEnv("STRIPE_SECRET_KEY", "rk_live_abc", { isDev: false }),
    ).toBe("rk_live_abc");
    expect(
      readStripeEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc", { isDev: false }),
    ).toBe("whsec_abc");
  });

  it("refuses to start in production without a required value", () => {
    expect(() =>
      readStripeEnv("STRIPE_SECRET_KEY", undefined, { isDev: false }),
    ).toThrow(/STRIPE_SECRET_KEY is not set.*Refusing to start/);
    expect(() =>
      readStripeEnv("STRIPE_WEBHOOK_SECRET", "  ", { isDev: false }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET is not set/);
  });

  it("refuses a value of the wrong kind in production", () => {
    // A publishable key pasted where the secret key goes.
    expect(() =>
      readStripeEnv("STRIPE_SECRET_KEY", "pk_live_abc", { isDev: false }),
    ).toThrow(/doesn't look like a Stripe value/);
    expect(() =>
      readStripeEnv("STRIPE_WEBHOOK_SECRET", "sk_live_abc", { isDev: false }),
    ).toThrow(/whsec_/);
  });

  it("lets an optional value be unset, but not malformed", () => {
    expect(
      readStripeEnv("STRIPE_CONNECT_WEBHOOK_SECRET", undefined, {
        isDev: false,
        optional: true,
      }),
    ).toBe("");
    expect(() =>
      readStripeEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "abc", {
        isDev: false,
        optional: true,
      }),
    ).toThrow(/whsec_/);
  });

  it("only warns in development, and stays quiet in tests", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readStripeEnv("STRIPE_SECRET_KEY", "", { isDev: true })).toBe("");
    expect(warn).not.toHaveBeenCalled(); // NODE_ENV is "test" here

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      readStripeEnv("STRIPE_SECRET_KEY", "", { isDev: true });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("STRIPE_SECRET_KEY is not set"),
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
