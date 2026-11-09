import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("../src/utils/prisma", () => ({
  prisma: { user: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import LeaderboardRepo from "../src/modules/leaderboard/leaderboard.repository";

const whereOf = () =>
  (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;

/**
 * Gear, Talent and Performer Foxer were folded into Provider (#273). Their
 * names, and the app's gear/services/performers, still pick a Provider board:
 * Providers who list that kind of thing.
 */
describe("Foxer leaderboard role filter", () => {
  beforeEach(() => findMany.mockReset().mockResolvedValue([]));

  it.each(["gear", "gearFoxer"])("%s ranks Providers with gear", async (r) => {
    await LeaderboardRepo.getFoxersForRanking(r);
    expect(whereOf()).toMatchObject({
      roleType: { hasSome: ["providerFoxer"] },
      assets: { some: { deletedAt: null } },
    });
  });

  it.each(["services", "serviceFoxer"])(
    "%s ranks Providers with non-performer services",
    async (r) => {
      await LeaderboardRepo.getFoxersForRanking(r);
      const where = whereOf() as {
        services: { some: { category: { notIn: string[] } } };
      };
      expect(where.services.some.category.notIn).toContain("dj");
    },
  );

  it.each(["performers", "performerFoxer"])(
    "%s ranks Providers with performer services",
    async (r) => {
      await LeaderboardRepo.getFoxersForRanking(r);
      const where = whereOf() as {
        services: { some: { category: { in: string[] } } };
      };
      expect(where.services.some.category.in).toContain("dj");
    },
  );

  it("ranks every Provider for providerFoxer", async () => {
    await LeaderboardRepo.getFoxersForRanking("providerFoxer");
    expect(whereOf()).toEqual({ roleType: { hasSome: ["providerFoxer"] } });
  });

  it("ranks every Foxer for an unknown or missing role", async () => {
    await LeaderboardRepo.getFoxersForRanking("nonsense");
    expect(whereOf()).toEqual({
      roleType: { hasSome: ["providerFoxer", "venueFoxer", "eventFoxer"] },
    });
  });
});
