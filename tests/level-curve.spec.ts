import { describe, it, expect } from "vitest";
import { UserPath } from "@prisma/client";
import {
  xpRequiredForLevel,
  calculateLevel,
} from "../src/modules/passport/passport.service";
import { planPathRecompute } from "../src/modules/passport/level-recompute";

// requirements/xp-and-coins.md, section 4.1 (the proposed curve).
const SPEC_TABLE: Record<number, number> = {
  2: 250,
  3: 530,
  5: 1_195,
  10: 3_694,
  15: 8_098,
  20: 15_860,
  30: 48_514,
  40: 86_464,
  50: 124_414,
};

describe("level curve", () => {
  it.each(Object.entries(SPEC_TABLE))(
    "level %s starts at %s XP, as the spec table says",
    (level, xp) => {
      expect(xpRequiredForLevel(Number(level))).toBe(xp);
    },
  );

  it("starts level 1 at 0 XP", () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(0)).toBe(0);
  });

  it("makes every level cost the same from level 25 on", () => {
    const cost = (l: number) =>
      xpRequiredForLevel(l + 1) - xpRequiredForLevel(l);
    expect(cost(24)).toBeLessThan(cost(25));
    expect(cost(25)).toBe(cost(26));
    expect(cost(26)).toBe(cost(60));
  });

  it("always costs more XP for a higher level", () => {
    for (let l = 1; l < 80; l++) {
      expect(xpRequiredForLevel(l + 1)).toBeGreaterThan(xpRequiredForLevel(l));
    }
  });

  it("puts a player at the right level on each side of a boundary", () => {
    expect(calculateLevel(0).level).toBe(1);
    expect(calculateLevel(249).level).toBe(1);
    expect(calculateLevel(250).level).toBe(2);
    expect(calculateLevel(15_859).level).toBe(19);
    expect(calculateLevel(15_860).level).toBe(20);
    expect(calculateLevel(124_413).level).toBe(49);
    expect(calculateLevel(124_414).level).toBe(50);
  });

  it("reports progress inside the level", () => {
    expect(calculateLevel(300)).toEqual({
      level: 2,
      currentXP: 50,
      requiredXP: 280,
    });
  });
});

describe("planPathRecompute", () => {
  const citizen = UserPath.user;

  it("raises a level the old curve held back and grants the perks it passed", () => {
    // 4,000 XP was level 3 on the old curve; it is level 10 now.
    const plan = planPathRecompute({
      path: citizen,
      totalXP: 4_000,
      level: 3,
      currentXP: 0,
      perks: ["early_bird"],
    });
    expect(plan.level).toBe(10);
    expect(plan.changed).toBe(true);
    expect(plan.missingPerks).toEqual(["priority_access", "vip_lounge"]);
  });

  it("does nothing for a path already on the new curve", () => {
    const { level, currentXP } = calculateLevel(1_000);
    const plan = planPathRecompute({
      path: citizen,
      totalXP: 1_000,
      level,
      currentXP,
      perks: ["early_bird"],
    });
    expect(plan.changed).toBe(false);
    expect(plan.missingPerks).toEqual([]);
  });

  it("does not grant a perk the passport already holds", () => {
    const plan = planPathRecompute({
      path: citizen,
      totalXP: 4_000,
      level: 3,
      currentXP: 0,
      perks: ["early_bird", "priority_access", "vip_lounge"],
    });
    expect(plan.missingPerks).toEqual([]);
  });

  it("grants nothing for a path with no perk table", () => {
    const plan = planPathRecompute({
      path: "unknownPath",
      totalXP: 50_000,
      level: 1,
      currentXP: 0,
      perks: [],
    });
    expect(plan.missingPerks).toEqual([]);
  });
});
