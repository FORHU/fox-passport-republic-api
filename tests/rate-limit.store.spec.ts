import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The limiters ran on express-rate-limit's MemoryStore, so their counters lived
 * in one process's heap: a restart handed an attacker their budget back, and
 * every additional instance multiplied every published limit.
 *
 * Two things have to hold for the Redis-backed store to be an improvement
 * rather than a swap of one failure for another. It must survive Redis being
 * absent - `redis.util` is deliberately fail-soft and hands out `null` - and it
 * must keep each limiter's key space separate, which MemoryStore gave for free
 * by being a fresh instance per limiter and one shared Redis does not.
 */

const redis = vi.hoisted(() => ({
  client: null as null | { sendCommand: (args: string[]) => Promise<unknown> },
}));

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

import { createRateLimitStore } from "../src/utils/rate-limit-store";
import type { Options } from "express-rate-limit";

const OPTIONS = { windowMs: 60_000 } as Options;

function store(prefix = "test") {
  const s = createRateLimitStore(prefix);
  s.init?.(OPTIONS);
  return s;
}

beforeEach(() => {
  redis.client = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("with Redis unavailable", () => {
  it("counts in memory rather than throwing", async () => {
    const s = store();

    expect((await s.increment("a")).totalHits).toBe(1);
    expect((await s.increment("a")).totalHits).toBe(2);
  });

  it("keeps separate keys separate", async () => {
    const s = store();

    await s.increment("a");
    await s.increment("a");

    expect((await s.increment("b")).totalHits).toBe(1);
  });

  it("still refunds a hit on decrement", async () => {
    // skipSuccessfulRequests refunds through here. A decrement that quietly did
    // nothing would leave successful sign-ins counted against a failure-only
    // budget.
    const s = store();

    await s.increment("a");
    await s.increment("a");
    await s.decrement("a");

    expect((await s.increment("a")).totalHits).toBe(2);
  });

  it("resets a key", async () => {
    const s = store();

    await s.increment("a");
    await s.resetKey("a");

    expect((await s.increment("a")).totalHits).toBe(1);
  });
});

describe("when a Redis command fails mid-flight", () => {
  it("falls back to memory instead of failing the request", async () => {
    redis.client = {
      sendCommand: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = store();

    // The point: this resolves rather than rejecting. A limiter that throws
    // when Redis blinks turns a rate-limiting weakness into an outage.
    expect((await s.increment("a")).totalHits).toBe(1);
    expect((await s.increment("a")).totalHits).toBe(2);
    expect(warn).toHaveBeenCalled();
  });

  it("warns once, not on every request", async () => {
    redis.client = {
      sendCommand: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = store();

    for (let i = 0; i < 5; i++) await s.increment("a");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("key spaces", () => {
  it("gives each limiter its own prefix", async () => {
    // MemoryStore isolated the buckets by being a separate instance per
    // limiter. On one shared Redis the per-account login limiter and the
    // per-account OTP limiter key on the same normalised email, so without
    // distinct prefixes a user's failed sign-ins would spend their
    // password-reset budget.
    // rate-limit-redis loads a Lua script first and only EVALSHAs it with the
    // key afterwards, so SCRIPT LOAD has to succeed or no key is ever sent.
    const keys: string[] = [];
    redis.client = {
      sendCommand: vi.fn(async (args: string[]) => {
        if (args[0] === "SCRIPT") return "sha";
        if (args[0] === "EVALSHA") keys.push(...args.slice(3));
        return [1, 60_000];
      }),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const login = store("login:account");
    const otp = store("otp-verify:account");
    await login.increment("someone@example.com");
    await otp.increment("someone@example.com");

    expect(keys).toContain("rl:login:account:someone@example.com");
    expect(keys).toContain("rl:otp-verify:account:someone@example.com");
  });
});

/**
 * The store used to be built in the constructor, and rate-limit-redis fires two
 * `SCRIPT LOAD`s from its own constructor and parks the promises for the first
 * request. With no Redis those rejected with nobody awaiting them, and Node
 * ends the process on an unhandled rejection - so the API could not start at
 * all without Redis, which is the exact outage the fallback exists to prevent.
 */
describe("starting up", () => {
  async function rejectionsWhile(work: () => void | Promise<void>) {
    const seen: unknown[] = [];
    const onRejection = (reason: unknown) => seen.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      await work();
      // Two turns: one for the promise, one for Node to decide nobody caught it.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    return seen;
  }

  it("builds no Redis store, and leaves nothing unhandled, when Redis is absent", async () => {
    expect(await rejectionsWhile(() => store())).toEqual([]);
  });

  it("touches Redis on the first request rather than at construction", async () => {
    const sendCommand = vi.fn(async () => "sha");
    redis.client = { sendCommand };

    const s = store();
    expect(sendCommand).not.toHaveBeenCalled();

    await s.increment("a");
    expect(sendCommand).toHaveBeenCalled();
  });

  it("leaves nothing unhandled when the script load itself fails", async () => {
    redis.client = {
      sendCommand: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = store();

    const seen = await rejectionsWhile(async () => {
      await s.increment("a");
    });

    expect(seen).toEqual([]);
  });
});
