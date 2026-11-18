import { describe, it, expect, vi, beforeEach } from "vitest";
import { AchievementSvc } from "../src/modules/achievement/achievement.service";
import {
  CITIZEN_ACHIEVEMENTS,
  FOXER_ACHIEVEMENTS,
} from "../src/modules/achievement/achievement.constants";
import PassportSvc from "../src/modules/passport/passport.service";
import RewardRepo from "../src/modules/reward/reward.repository";
import { prisma } from "../src/utils/prisma";

vi.mock("../src/modules/passport/passport.service", () => ({
  default: {
    awardXP: vi.fn().mockResolvedValue({}),
    awardBadgeByName: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../src/modules/reward/reward.repository", () => ({
  default: {
    recordGrant: vi.fn().mockResolvedValue({}),
    findEventByIdempotencyKey: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    userBadge: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
    badge: {
      findUnique: vi.fn(),
    },
    passport: {
      findUnique: vi.fn(),
    },
  },
}));

describe("Achievements Engine (Specification §6)", () => {
  const userId = "test-user-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tier Progression & Target Calculation", () => {
    const regularDef = CITIZEN_ACHIEVEMENTS.find((a) => a.key === "regular")!;

    it("evaluates tier 0 when below first tier target", async () => {
      const result = await AchievementSvc.evaluateAchievement(
        userId,
        regularDef,
        0, // Target 1 is 1
      );

      expect(result.key).toBe("regular");
      expect(result.currentCount).toBe(0);
      expect(result.currentTier).toBe(0);
      expect(result.nextTier).toBe(1);
      expect(result.targetCount).toBe(1);
      expect(result.progressPercentage).toBe(0);
      expect(PassportSvc.awardXP).not.toHaveBeenCalled();
      expect(RewardRepo.recordGrant).not.toHaveBeenCalled();
    });

    it("evaluates tier 1 and pays no Tokens for it (milestones pay them, on the event)", async () => {
      const result = await AchievementSvc.evaluateAchievement(
        userId,
        regularDef,
        1, // Target 1 is 1
      );

      expect(result.currentTier).toBe(1);
      expect(result.nextTier).toBe(2);
      expect(result.targetCount).toBe(10);
      expect(PassportSvc.awardXP).not.toHaveBeenCalled();
      // Reading never pays: no grant, and the tiers advertise no Tokens
      expect(RewardRepo.recordGrant).not.toHaveBeenCalled();
      expect(result.tiers.every((t) => t.coins === 0)).toBe(true);
    });

    it("reading twice still pays nothing", async () => {
      await AchievementSvc.evaluateAchievement(userId, regularDef, 50);
      await AchievementSvc.evaluateAchievement(userId, regularDef, 50);
      expect(RewardRepo.recordGrant).not.toHaveBeenCalled();
    });

    it("evaluates tier 3 completion (100% progress, nextTier null)", async () => {
      vi.mocked(prisma.badge.findUnique).mockResolvedValue({
        id: "badge-regular-3",
        name: "Regular",
      } as any);

      vi.mocked(prisma.passport.findUnique).mockResolvedValue({
        id: "passport-1",
        userId,
      } as any);

      const result = await AchievementSvc.evaluateAchievement(
        userId,
        regularDef,
        50, // Target 3 is 50
      );

      expect(result.currentTier).toBe(3);
      expect(result.nextTier).toBeNull();
      expect(result.progressPercentage).toBe(100);
      expect(result.isCompleted).toBe(true);

      // Verifies Tier III badge award
      expect(PassportSvc.awardBadgeByName).toHaveBeenCalledWith(
        userId,
        "Regular",
      );
    });
  });

  describe("Social Achievements Anti-Exploit Guardrail (§6.2)", () => {
    it("ensures Storyteller awards XP only and zero coins across all tiers", () => {
      const storyteller = CITIZEN_ACHIEVEMENTS.find(
        (a) => a.key === "storyteller",
      )!;
      expect(storyteller).toBeDefined();
      expect(storyteller.tiers[0].coins).toBe(0);
      expect(storyteller.tiers[1].coins).toBe(0);
      expect(storyteller.tiers[2].coins).toBe(0);
      expect(storyteller.tiers[0].xp).toBeGreaterThan(0);
    });

    it("ensures Conversationalist awards XP only and zero coins across all tiers", () => {
      const conv = CITIZEN_ACHIEVEMENTS.find(
        (a) => a.key === "conversationalist",
      )!;
      expect(conv).toBeDefined();
      expect(conv.tiers[0].coins).toBe(0);
      expect(conv.tiers[1].coins).toBe(0);
      expect(conv.tiers[2].coins).toBe(0);
      expect(conv.tiers[0].xp).toBeGreaterThan(0);
    });

    it("ensures Crowd Favorite awards XP only and zero coins across all tiers", () => {
      const crowd = CITIZEN_ACHIEVEMENTS.find(
        (a) => a.key === "crowd_favorite",
      )!;
      expect(crowd).toBeDefined();
      expect(crowd.tiers[0].coins).toBe(0);
      expect(crowd.tiers[1].coins).toBe(0);
      expect(crowd.tiers[2].coins).toBe(0);
      expect(crowd.tiers[0].xp).toBeGreaterThan(0);
    });
  });

  describe("Foxer Achievements Configuration", () => {
    it("contains all 5 operational achievements with 3 tiers each", () => {
      expect(FOXER_ACHIEVEMENTS).toHaveLength(5);
      const keys = FOXER_ACHIEVEMENTS.map((a) => a.key);
      expect(keys).toContain("open_for_business");
      expect(keys).toContain("fully_booked");
      expect(keys).toContain("five_stars");
      expect(keys).toContain("quick_responder");
      expect(keys).toContain("reliable");

      for (const ach of FOXER_ACHIEVEMENTS) {
        expect(ach.tiers).toHaveLength(3);
        expect(ach.tiers[0].target).toBeLessThan(ach.tiers[1].target);
        expect(ach.tiers[1].target).toBeLessThan(ach.tiers[2].target);
      }
    });
  });
});
