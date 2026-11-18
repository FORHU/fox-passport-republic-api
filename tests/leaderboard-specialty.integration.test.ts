import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RoleType } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import LeaderboardRepo from "../src/modules/leaderboard/leaderboard.repository";

/**
 * The Foxer leaderboard's specialty filter (RR-2 A3): a Provider appears under
 * each specialty they declared, and only Providers who declared it appear.
 */
describe("LeaderboardRepo.getFoxersForRanking — specialty filter", () => {
  const runId = Math.random().toString(36).substring(7);
  const city = `SpecialtyCity-${runId}`;
  let photographerId: string;
  let djId: string;

  beforeAll(async () => {
    const photographer = await prisma.user.create({
      data: {
        email: `lb_photo_${runId}@test.com`,
        password: "pw",
        name: "Photographer",
        city,
        roleType: [RoleType.providerFoxer],
      },
    });
    const dj = await prisma.user.create({
      data: {
        email: `lb_dj_${runId}@test.com`,
        password: "pw",
        name: "DJ",
        city,
        roleType: [RoleType.providerFoxer],
      },
    });
    photographerId = photographer.id;
    djId = dj.id;
    await prisma.foxerSpecialization.createMany({
      data: [
        {
          userId: photographerId,
          roleType: RoleType.providerFoxer,
          category: "photography",
          source: "declared",
        },
        {
          userId: photographerId,
          roleType: RoleType.providerFoxer,
          category: "videography",
          source: "declared",
        },
        {
          userId: djId,
          roleType: RoleType.providerFoxer,
          category: "dj",
          source: "declared",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [photographerId, djId] } },
    });
  });

  const ids = async (specialty?: string) =>
    (
      await LeaderboardRepo.getFoxersForRanking(
        "providerFoxer",
        city,
        specialty,
      )
    )
      .map((u) => u.id)
      .sort();

  it("returns only Providers who declared the specialty", async () => {
    expect(await ids("photography")).toEqual([photographerId]);
    expect(await ids("dj")).toEqual([djId]);
  });

  it("finds a Provider under each of their specialties", async () => {
    expect(await ids("videography")).toEqual([photographerId]);
  });

  it("returns every Provider without a specialty, and none for an unknown one", async () => {
    expect(await ids()).toEqual([photographerId, djId].sort());
    expect(await ids("drone-photography")).toEqual([]);
  });
});
