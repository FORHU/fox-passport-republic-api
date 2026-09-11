import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * The caching helper exists for a handful of deliberately chosen reads, and the
 * property that matters most is not the speed-up: it is that a cache can never
 * fail a request it was only meant to make faster. Redis being absent, slow, or
 * broken must all end in the caller getting a real answer.
 */

type FakeClient = {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, o?: unknown) => Promise<unknown>;
  incr?: (k: string) => Promise<number>;
};

const redis = vi.hoisted(() => ({ client: null as null | FakeClient }));

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

import { cached, versionedCache } from "../src/utils/cache.util";

function workingRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }),
    incr: vi.fn(async (k: string) => {
      const next = Number(store.get(k) ?? "0") + 1;
      store.set(k, String(next));
      return next;
    }),
  };
}

beforeEach(() => {
  redis.client = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("with Redis available", () => {
  it("computes once and serves the second call from cache", async () => {
    redis.client = workingRedis();
    const produce = vi.fn(async () => ["Makati", "Manila"]);

    const first = await cached("cities:mak:8", 600, produce);
    const second = await cached("cities:mak:8", 600, produce);

    expect(first).toEqual(["Makati", "Manila"]);
    expect(second).toEqual(["Makati", "Manila"]);
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys apart", async () => {
    redis.client = workingRedis();

    await cached("a", 600, async () => "one");
    const b = await cached("b", 600, async () => "two");

    expect(b).toBe("two");
  });

  it("writes with the TTL it was given", async () => {
    const client = workingRedis();
    redis.client = client;

    await cached("k", 300, async () => "v");

    expect(client.set).toHaveBeenCalledWith(
      "cache:k",
      JSON.stringify("v"),
      expect.objectContaining({ EX: 300 }),
    );
  });

  it("namespaces its keys so it cannot collide with the OTP or ticket keys", async () => {
    const client = workingRedis();
    redis.client = client;

    await cached("k", 300, async () => "v");

    expect([...client.store.keys()]).toEqual(["cache:k"]);
  });
});

describe("when Redis is not there", () => {
  it("computes directly rather than failing", async () => {
    const produce = vi.fn(async () => "value");

    expect(await cached("k", 600, produce)).toBe("value");
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it("computes every time, since nothing is stored", async () => {
    const produce = vi.fn(async () => "value");

    await cached("k", 600, produce);
    await cached("k", 600, produce);

    expect(produce).toHaveBeenCalledTimes(2);
  });
});

describe("when Redis is broken", () => {
  it("still answers when the read throws", async () => {
    redis.client = {
      get: vi.fn(async () => {
        throw new Error("connection reset");
      }),
      set: vi.fn(async () => "OK"),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await cached("k", 600, async () => "value")).toBe("value");
  });

  it("still answers when the write throws", async () => {
    // The caller already has its answer by this point; failing to store it is
    // not the caller's problem.
    redis.client = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {
        throw new Error("OOM");
      }),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await cached("k", 600, async () => "value")).toBe("value");
  });
});

/**
 * The shape of a cached answer must not depend on whether the cache was warm,
 * or on whether Redis is running at all. The admin dashboard found this once by
 * hand - a `Decimal` came back from the cache as a string while the uncached
 * path returned a Decimal - and the fix there was to serialise that one field.
 * Round-tripping every path is the same fix, made general and typed.
 */
describe("the shape a cached read returns", () => {
  const produce = async () => ({
    startAt: new Date("2026-09-09T10:00:00.000Z"),
    totalAmount: new Prisma.Decimal("100.50"),
    name: "Fox Night",
  });

  it("is the same on the miss, on the hit, and with no Redis at all", async () => {
    const withoutRedis = await cached("shape", 60, produce);

    redis.client = workingRedis();
    const miss = await cached("shape", 60, produce);
    const hit = await cached("shape", 60, produce);

    expect(miss).toEqual(withoutRedis);
    expect(hit).toEqual(withoutRedis);
  });

  it("hands back JSON, not Prisma types", async () => {
    redis.client = workingRedis();

    const value = await cached("shape", 60, produce);

    // `toISOString()` on either of these is the runtime TypeError the return
    // type now makes a compile error.
    expect(value.startAt).toBe("2026-09-09T10:00:00.000Z");
    expect(value.totalAmount).toBe("100.5");
  });
});

/**
 * `invalidate` has to name its keys, which a paginated per-user list cannot -
 * the keys carry a page, a page size and a hash of the caller's filters. The
 * version counter is how an unbounded key set is retired from one place.
 */
describe("the versioned cache", () => {
  it("serves the second call from cache", async () => {
    redis.client = workingRedis();
    const bookings = versionedCache("booking");
    const produce = vi.fn(async () => ["b1"]);

    await bookings.cached("user:u1:1:10", 30, produce);
    await bookings.cached("user:u1:1:10", 30, produce);

    expect(produce).toHaveBeenCalledTimes(1);
  });

  it("retires every key in the namespace on a bump, without naming one", async () => {
    redis.client = workingRedis();
    const bookings = versionedCache("booking");
    const list = vi.fn(async () => ["b1"]);
    const upcoming = vi.fn(async () => ["b2"]);

    await bookings.cached("user:u1:1:10", 30, list);
    await bookings.cached("upcoming:u1", 30, upcoming);

    await bookings.invalidateAll();

    await bookings.cached("user:u1:1:10", 30, list);
    await bookings.cached("upcoming:u1", 30, upcoming);

    expect(list).toHaveBeenCalledTimes(2);
    expect(upcoming).toHaveBeenCalledTimes(2);
  });

  it("leaves other namespaces alone", async () => {
    redis.client = workingRedis();
    const bookings = versionedCache("booking");
    const venues = versionedCache("venue");
    const venueList = vi.fn(async () => ["v1"]);

    await venues.cached("all", 30, venueList);
    await bookings.invalidateAll();
    await venues.cached("all", 30, venueList);

    expect(venueList).toHaveBeenCalledTimes(1);
  });

  it("answers without a cache when the version cannot be read", async () => {
    // Guessing a version could serve an entry a bump was meant to retire, so
    // the read is simply not cached this time.
    redis.client = {
      get: vi.fn(async () => {
        throw new Error("connection reset");
      }),
      set: vi.fn(async () => "OK"),
      incr: vi.fn(async () => 1),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bookings = versionedCache("booking");
    const produce = vi.fn(async () => ["b1"]);

    expect(await bookings.cached("k", 30, produce)).toEqual(["b1"]);
    expect(await bookings.cached("k", 30, produce)).toEqual(["b1"]);
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("does not fail a write when the bump throws", async () => {
    redis.client = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => "OK"),
      incr: vi.fn(async () => {
        throw new Error("OOM");
      }),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      versionedCache("booking").invalidateAll(),
    ).resolves.toBeUndefined();
  });

  it("computes directly when Redis is not there", async () => {
    const produce = vi.fn(async () => ["b1"]);
    const bookings = versionedCache("booking");

    await bookings.cached("k", 30, produce);
    await bookings.invalidateAll();
    await bookings.cached("k", 30, produce);

    expect(produce).toHaveBeenCalledTimes(2);
  });
});
