import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * The admin dashboard was the heaviest read in the API - eight queries per
 * load - and lived in the controller with no service to cache at. It is cached
 * now, which introduces the failure mode caching always introduces: an admin
 * resolves something and the queue still shows it.
 *
 * So the queues are invalidated by the writes as well as expiring, and the
 * revenue total is serialised rather than left as a Decimal, which would come
 * back from a JSON round-trip as a different type than the uncached path
 * returned.
 */

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return keys.length;
      }),
      // versionedCache — the queues carry a page and a limit, so their keys
      // cannot be named at invalidation time and are retired by an INCR
      // instead. See cache.util.ts.
      incr: vi.fn(async (k: string) => {
        const next = Number(store.get(k) ?? "0") + 1;
        store.set(k, String(next));
        return next;
      }),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

const repo = vi.hoisted(() => ({
  findStatsInputs: vi.fn(),
  findDisputedRefunds: vi.fn(async () => ({
    rows: [{ id: "refund-1" }],
    total: 1,
  })),
  findAllRefunds: vi.fn(async () => ({ rows: [], total: 0 })),
  findDisputedAssetBookings: vi.fn(async () => ({ rows: [], total: 0 })),
  findDisputedServiceBookings: vi.fn(async () => ({ rows: [], total: 0 })),
  findEventTemplates: vi.fn(async () => ({ rows: [], total: 0 })),
}));

/**
 * `queuePage` is real rather than mocked - it is pure, it decides the cache
 * key the tests below depend on, and re-implementing its clamping here would
 * just be a second copy to keep in sync with the one under test.
 */
vi.mock("../src/modules/admin/admin.repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/modules/admin/admin.repository")
    >();
  return { ...actual, default: repo };
});

import AdminSvc from "../src/modules/admin/admin.service";

const STATS_INPUTS = {
  totalUsers: 148,
  totalVenues: 128,
  totalEventTemplates: 12,
  pendingRoleRequests: 3,
  // Postgres does the summing and the bucketing now - the dashboard used to
  // load every non-cancelled booking ever made and do both in Node.
  bookingTotals: {
    _sum: { totalAmount: new Prisma.Decimal("100.50") },
    _count: { _all: 1 },
  },
  bookingsByDayOfWeek: [{ dow: 3, count: 1 }],
  serviceBookings: { _sum: { totalAmount: new Prisma.Decimal("10") } },
  assetBookings: { _sum: { totalAmount: new Prisma.Decimal("5") } },
  categoryGroups: [{ eventCategory: "music", _count: { id: 4 } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
  repo.findStatsInputs.mockResolvedValue(STATS_INPUTS);
});

describe("the admin dashboard", () => {
  it("runs its eight queries once, then serves from cache", async () => {
    await AdminSvc.getStats();
    await AdminSvc.getStats();

    expect(repo.findStatsInputs).toHaveBeenCalledTimes(1);
  });

  it("returns revenue as a string, cached or not", async () => {
    // A Decimal cannot survive JSON as itself. If the uncached path returned a
    // Decimal and the cached path a string, the response type would depend on
    // cache state - which is the kind of bug that only shows up under load.
    const fresh = await AdminSvc.getStats();
    const fromCache = await AdminSvc.getStats();

    expect(fresh.totalRevenue).toBe("115.5");
    expect(fromCache.totalRevenue).toBe(fresh.totalRevenue);
    expect(typeof fromCache.totalRevenue).toBe("string");
  });

  it("spreads the counted days into seven slots", async () => {
    // The query returns a row per day that had bookings, so a quiet Monday has
    // no row at all rather than a zero - and the chart needs the zero.
    repo.findStatsInputs.mockResolvedValue({
      ...STATS_INPUTS,
      bookingsByDayOfWeek: [
        { dow: 0, count: 2 },
        { dow: 6, count: 5 },
      ],
    });

    const stats = await AdminSvc.getStats();

    expect(stats.bookingsByDay).toEqual([2, 0, 0, 0, 0, 0, 5]);
  });

  it("counts all time in the total, and thirty days in the chart", async () => {
    repo.findStatsInputs.mockResolvedValue({
      ...STATS_INPUTS,
      bookingTotals: {
        _sum: { totalAmount: new Prisma.Decimal("1") },
        _count: { _all: 900 },
      },
      bookingsByDayOfWeek: [],
    });

    const stats = await AdminSvc.getStats();

    expect(stats.bookingsByDay.reduce((a, b) => a + b, 0)).toBe(0);
    expect(stats.totalBookings).toBe(900);
  });
});

describe("the queues", () => {
  it("serve from cache on a repeat load", async () => {
    await AdminSvc.getDisputes();
    await AdminSvc.getDisputes();

    expect(repo.findDisputedRefunds).toHaveBeenCalledTimes(1);
  });

  it("re-query after a write invalidates them", async () => {
    // The whole point. An admin resolves a dispute and looks straight back at
    // the list; a TTL alone would leave their own action apparently undone.
    await AdminSvc.getDisputes();
    await AdminSvc.invalidateQueues();
    await AdminSvc.getDisputes();

    expect(repo.findDisputedRefunds).toHaveBeenCalledTimes(2);
  });

  it("drops the dashboard as well, since approvals move its numbers", async () => {
    await AdminSvc.getStats();
    await AdminSvc.invalidateQueues();
    await AdminSvc.getStats();

    expect(repo.findStatsInputs).toHaveBeenCalledTimes(2);
  });

  it("keeps each template status in its own entry", async () => {
    await AdminSvc.getEventTemplates();
    await AdminSvc.getEventTemplates();

    expect(repo.findEventTemplates).toHaveBeenCalledTimes(1);
    expect([...redis.store.keys()]).toContain(
      "cache:admin:0:event-templates:all:1:50",
    );
  });
});

/**
 * The queues used to be an unbounded read capped at 500 rows, with no way to
 * reach anything past the cap and no signal that anything had been cut off. A
 * queue at exactly 500 and a queue with thousands more behind it looked
 * identical. This is the fix: every queue is paginated, keys on the *clamped*
 * page and size rather than on whatever the caller sent, and reports `total`
 * so the console can say how many rows exist.
 */
describe("the queues are paginated, not capped", () => {
  it("keys on the clamped page and limit, so junk input cannot mint its own entry", async () => {
    await AdminSvc.getDisputes(1, 1_000_000_000);
    await AdminSvc.getDisputes(1, 1_000_000_000);

    // 1e9 clamps to QUEUE_MAX_PAGE_SIZE (200), so both calls hit one entry.
    expect(repo.findDisputedRefunds).toHaveBeenCalledTimes(1);
    expect(repo.findDisputedRefunds).toHaveBeenCalledWith(0, 200);
  });

  it("passes skip and take through to the repository", async () => {
    await AdminSvc.getDisputes(3, 25);

    expect(repo.findDisputedRefunds).toHaveBeenCalledWith(50, 25);
  });

  it("reports total and totalPages alongside the rows", async () => {
    repo.findDisputedRefunds.mockResolvedValueOnce({
      rows: [{ id: "r1" }, { id: "r2" }],
      total: 87,
    });

    const result = await AdminSvc.getDisputes(2, 10);

    expect(result).toMatchObject({
      total: 87,
      page: 2,
      limit: 10,
      totalPages: 9,
    });
    expect(result.rows).toHaveLength(2);
  });

  it("different pages of the same queue are different cache entries", async () => {
    await AdminSvc.getDisputes(1, 50);
    await AdminSvc.getDisputes(2, 50);
    await AdminSvc.getDisputes(1, 50);

    // Page 1 and page 2 are separate fills; page 1 again is a hit.
    expect(repo.findDisputedRefunds).toHaveBeenCalledTimes(2);
  });

  it("a queue write retires every page, not just the one open when it happened", async () => {
    await AdminSvc.getDisputes(1, 50);
    await AdminSvc.getDisputes(2, 50);
    await AdminSvc.invalidateQueues();
    await AdminSvc.getDisputes(1, 50);
    await AdminSvc.getDisputes(2, 50);

    expect(repo.findDisputedRefunds).toHaveBeenCalledTimes(4);
  });
});
