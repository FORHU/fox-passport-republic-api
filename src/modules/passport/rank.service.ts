import { BadgeRarity, UserPath } from "@prisma/client";

/**
 * The nine-rank ladder (requirements/xp-and-coins.md, section 4.2). Citizen and
 * Foxer ladders share the thresholds and the rarity; only the names differ.
 * Thresholds sit on levels where perks already unlock, so rank-ups line up
 * with them.
 */
interface LadderStep {
  /** 1 to 9. */
  number: number;
  /** First level of the rank. */
  minLevel: number;
  citizen: string;
  foxer: string;
  rarity: BadgeRarity;
  /**
   * Coins the spec pays on reaching the rank. Nothing pays them yet: that
   * needs the monthly Coin pool (section 7.4), which is not built.
   */
  rankUpCoins: number;
}

const LADDER: readonly LadderStep[] = [
  {
    number: 1,
    minLevel: 1,
    citizen: "Newcomer",
    foxer: "Rookie",
    rarity: BadgeRarity.Common,
    rankUpCoins: 0,
  },
  {
    number: 2,
    minLevel: 3,
    citizen: "Wanderer",
    foxer: "Regular",
    rarity: BadgeRarity.Common,
    rankUpCoins: 50,
  },
  {
    number: 3,
    minLevel: 5,
    citizen: "Explorer",
    foxer: "Pro",
    rarity: BadgeRarity.Uncommon,
    rankUpCoins: 100,
  },
  {
    number: 4,
    minLevel: 10,
    citizen: "Trailblazer",
    foxer: "Veteran",
    rarity: BadgeRarity.Uncommon,
    rankUpCoins: 200,
  },
  {
    number: 5,
    minLevel: 15,
    citizen: "Voyager",
    foxer: "Headliner",
    rarity: BadgeRarity.Rare,
    rankUpCoins: 300,
  },
  {
    number: 6,
    minLevel: 20,
    citizen: "Adventurer",
    foxer: "Maestro",
    rarity: BadgeRarity.Rare,
    rankUpCoins: 500,
  },
  {
    number: 7,
    minLevel: 30,
    citizen: "Pioneer",
    foxer: "Icon",
    rarity: BadgeRarity.Epic,
    rankUpCoins: 800,
  },
  {
    number: 8,
    minLevel: 40,
    citizen: "Vanguard",
    foxer: "Luminary",
    rarity: BadgeRarity.Epic,
    rankUpCoins: 1200,
  },
  {
    number: 9,
    minLevel: 50,
    citizen: "Legend",
    foxer: "Legend",
    rarity: BadgeRarity.Legendary,
    rankUpCoins: 2000,
  },
];

export interface RankInfo {
  /** 1 to 9; the app picks the badge artwork from it. */
  number: number;
  name: string;
  rarity: BadgeRarity;
  minLevel: number;
  /** The next rank, or null at the top. */
  next: {
    number: number;
    name: string;
    minLevel: number;
    levelsToGo: number;
  } | null;
}

export default class RankSvc {
  /** Citizens use the citizen names; every other path uses the Foxer names. */
  private static nameOf(step: LadderStep, path: UserPath): string {
    return path === UserPath.user ? step.citizen : step.foxer;
  }

  /** The ladder step a level falls in. Anything below level 1 is rank 1. */
  private static stepFor(level: number): LadderStep {
    let found = LADDER[0];
    for (const step of LADDER) {
      if (level >= step.minLevel) found = step;
    }
    return found;
  }

  /** The rank for a level on a path, and what comes next. */
  static forLevel(level: number, path: UserPath = UserPath.user): RankInfo {
    const step = RankSvc.stepFor(level);
    const nextStep = LADDER.find((s) => s.number === step.number + 1);

    return {
      number: step.number,
      name: RankSvc.nameOf(step, path),
      rarity: step.rarity,
      minLevel: step.minLevel,
      next: nextStep
        ? {
            number: nextStep.number,
            name: RankSvc.nameOf(nextStep, path),
            minLevel: nextStep.minLevel,
            levelsToGo: Math.max(0, nextStep.minLevel - level),
          }
        : null,
    };
  }

  /** Just the name, for callers that only print it. */
  static nameForLevel(level: number, path: UserPath = UserPath.user): string {
    return RankSvc.forLevel(level, path).name;
  }

  /** Coins the spec pays on reaching a rank (0 for rank 1). Not paid yet. */
  static rankUpCoins(rankNumber: number): number {
    return LADDER.find((s) => s.number === rankNumber)?.rankUpCoins ?? 0;
  }
}
