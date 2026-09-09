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
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

const repo = vi.hoisted(() => ({
  findStatsInputs: vi.fn(),
  findDisputedRefunds: vi.fn(async () => [{ id: "refund-1" }]),
  findAllRefunds: vi.fn(async () => []),
  findDisputedAssetBookings: vi.fn(async () => []),
  findDisputedServiceBookings: vi.fn(async () => []),
  findEventTemplates: vi.fn(async () => []),
}));

vi.mock("../src/modules/admin/admin.repository", () => ({ default: repo }));

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
      "cache:admin:event-templates:all",
    );
  });
});
