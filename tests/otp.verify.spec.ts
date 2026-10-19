import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A wrong code used to delete the right one, so one typo meant a new email.
 * Now only a match consumes the code; guessing is left to the rate limiter.
 */

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

import { verifyOTP } from "../src/utils/otp.utils";

const email = "user@example.com";

beforeEach(() => {
  redis.store.clear();
  redis.store.set(`otp:${email}`, "123456");
});

describe("verifyOTP", () => {
  it("keeps the code after a wrong guess", async () => {
    expect(await verifyOTP(email, "000000")).toBe(false);
    expect(await verifyOTP(email, "123456")).toBe(true);
  });

  it("is single-use", async () => {
    expect(await verifyOTP(email, "123456")).toBe(true);
    expect(await verifyOTP(email, "123456")).toBe(false);
  });

  it("lets only one of two racing correct submissions through", async () => {
    const results = await Promise.all([
      verifyOTP(email, "123456"),
      verifyOTP(email, "123456"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
