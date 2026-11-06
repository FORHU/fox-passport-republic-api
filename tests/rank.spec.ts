import { describe, it, expect } from "vitest";
import { BadgeRarity, UserPath } from "@prisma/client";
import RankSvc from "../src/modules/passport/rank.service";
import PassportSvc from "../src/modules/passport/passport.service";
import RewardService from "../src/modules/reward/reward.service";

// requirements/xp-and-coins.md, section 4.2.
const CITIZEN = [
  [1, "Newcomer"],
  [3, "Wanderer"],
  [5, "Explorer"],
  [10, "Trailblazer"],
  [15, "Voyager"],
  [20, "Adventurer"],
  [30, "Pioneer"],
  [40, "Vanguard"],
  [50, "Legend"],
] as const;

const FOXER = [
  [1, "Rookie"],
  [3, "Regular"],
  [5, "Pro"],
  [10, "Veteran"],
  [15, "Headliner"],
  [20, "Maestro"],
  [30, "Icon"],
  [40, "Luminary"],
  [50, "Legend"],
] as const;

describe("RankSvc", () => {
  it.each(CITIZEN)("citizen level %i starts %s", (level, name) => {
    expect(RankSvc.forLevel(level, UserPath.user).name).toBe(name);
  });

  it.each(FOXER)("Foxer level %i starts %s", (level, name) => {
    expect(RankSvc.forLevel(level, UserPath.venueFoxer).name).toBe(name);
  });

  it("holds a rank until the next threshold", () => {
    expect(RankSvc.forLevel(2).name).toBe("Newcomer");
    expect(RankSvc.forLevel(4).name).toBe("Wanderer");
    expect(RankSvc.forLevel(19).name).toBe("Voyager");
    expect(RankSvc.forLevel(49).name).toBe("Vanguard");
  });

  it("treats a level below 1 as rank 1 and a level past 50 as Legend", () => {
    expect(RankSvc.forLevel(0).number).toBe(1);
    expect(RankSvc.forLevel(-5).number).toBe(1);
    expect(RankSvc.forLevel(500).name).toBe("Legend");
  });

  it("uses the Foxer names for every Foxer path, not just one", () => {
    for (const path of [
      UserPath.eventFoxer,
      UserPath.gearFoxer,
      UserPath.serviceFoxer,
      UserPath.performerFoxer,
      UserPath.providerFoxer,
      UserPath.organizer,
    ]) {
      expect(RankSvc.forLevel(20, path).name).toBe("Maestro");
    }
  });

  it("says what comes next and how many levels away it is", () => {
    const info = RankSvc.forLevel(17, UserPath.user);
    expect(info.number).toBe(5);
    expect(info.next).toEqual({
      number: 6,
      name: "Adventurer",
      minLevel: 20,
      levelsToGo: 3,
    });
  });

  it("has no next rank at the top", () => {
    expect(RankSvc.forLevel(50).next).toBeNull();
    expect(RankSvc.forLevel(80).next).toBeNull();
  });

  it("gives each rank the rarity the spec lists", () => {
    expect(RankSvc.forLevel(1).rarity).toBe(BadgeRarity.Common);
    expect(RankSvc.forLevel(5).rarity).toBe(BadgeRarity.Uncommon);
    expect(RankSvc.forLevel(20).rarity).toBe(BadgeRarity.Rare);
    expect(RankSvc.forLevel(40).rarity).toBe(BadgeRarity.Epic);
    expect(RankSvc.forLevel(50).rarity).toBe(BadgeRarity.Legendary);
  });

  it("lists the rank-up Coins from the spec, none for the first rank", () => {
    expect(RankSvc.rankUpCoins(1)).toBe(0);
    expect(RankSvc.rankUpCoins(2)).toBe(50);
    expect(RankSvc.rankUpCoins(6)).toBe(500);
    expect(RankSvc.rankUpCoins(9)).toBe(2000);
    expect(RankSvc.rankUpCoins(99)).toBe(0);
  });

  it("is the ladder RewardService.calculateRank answers from", () => {
    for (let level = 1; level <= 60; level++) {
      for (const path of [UserPath.user, UserPath.eventFoxer]) {
        expect(RewardService.calculateRank(level, path)).toBe(
          RankSvc.forLevel(level, path).name,
        );
      }
    }
  });
});

describe("PassportSvc.withRanks", () => {
  it("adds a rank to each path and leaves everything else alone", () => {
    const passport = {
      id: "p1",
      coins: 120,
      perks: ["early_bird"],
      paths: [
        { id: "a", path: UserPath.user, level: 20, totalXP: 15860 },
        { id: "b", path: UserPath.venueFoxer, level: 3, totalXP: 530 },
      ],
    };

    const out = PassportSvc.withRanks(passport);

    expect(out.id).toBe("p1");
    expect(out.coins).toBe(120);
    expect(out.perks).toEqual(["early_bird"]);
    expect(out.paths[0]).toMatchObject({
      id: "a",
      totalXP: 15860,
      rank: { number: 6, name: "Adventurer" },
    });
    expect(out.paths[1].rank.name).toBe("Regular");
  });

  it("handles a passport with no paths yet", () => {
    expect(PassportSvc.withRanks({ paths: [] }).paths).toEqual([]);
  });
});
