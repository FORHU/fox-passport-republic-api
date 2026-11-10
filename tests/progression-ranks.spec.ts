import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPath } from "@prisma/client";
import RewardService from "../src/modules/reward/reward.service";
import PassportSvc, {
  RANK_THRESHOLDS,
} from "../src/modules/passport/passport.service";
import PassportRepo from "../src/modules/passport/passport.repository";
import RewardRepo from "../src/modules/reward/reward.repository";

describe("Progression Ranks & Rank-up Bonuses (Specification section 4.2)", () => {
  describe("Rank Resolution", () => {
    it("maps citizen levels to correct 9-tier rank names", () => {
      expect(RewardService.calculateRank(1, UserPath.user)).toBe("Newcomer");
      expect(RewardService.calculateRank(2, UserPath.user)).toBe("Newcomer");
      expect(RewardService.calculateRank(3, UserPath.user)).toBe("Wanderer");
      expect(RewardService.calculateRank(5, UserPath.user)).toBe("Explorer");
      expect(RewardService.calculateRank(10, UserPath.user)).toBe(
        "Trailblazer",
      );
      expect(RewardService.calculateRank(15, UserPath.user)).toBe("Voyager");
      expect(RewardService.calculateRank(20, UserPath.user)).toBe("Adventurer");
      expect(RewardService.calculateRank(30, UserPath.user)).toBe("Pioneer");
      expect(RewardService.calculateRank(40, UserPath.user)).toBe("Vanguard");
      expect(RewardService.calculateRank(50, UserPath.user)).toBe("Legend");
      expect(RewardService.calculateRank(100, UserPath.user)).toBe("Legend");
    });

    it("maps Foxer levels to dual rank names", () => {
      expect(RewardService.calculateRank(1, UserPath.venueFoxer)).toBe(
        "Rookie",
      );
      expect(RewardService.calculateRank(3, UserPath.eventFoxer)).toBe(
        "Regular",
      );
      expect(RewardService.calculateRank(5, UserPath.providerFoxer)).toBe(
        "Pro",
      );
      expect(RewardService.calculateRank(10, UserPath.providerFoxer)).toBe(
        "Veteran",
      );
      expect(RewardService.calculateRank(15, UserPath.providerFoxer)).toBe(
        "Headliner",
      );
      expect(RewardService.calculateRank(20, UserPath.providerFoxer)).toBe(
        "Maestro",
      );
      expect(RewardService.calculateRank(30, UserPath.organizer)).toBe("Icon");
      expect(RewardService.calculateRank(40, UserPath.investor)).toBe(
        "Luminary",
      );
      expect(RewardService.calculateRank(50, UserPath.venueFoxer)).toBe(
        "Legend",
      );
    });
  });

  describe("Rank Thresholds Table", () => {
    it("matches the exact rank-up coins specification in table 4.2", () => {
      const expectedCoins: Record<number, number> = {
        3: 50,
        5: 100,
        10: 200,
        15: 300,
        20: 500,
        30: 800,
        40: 1200,
        50: 2000,
      };

      for (const t of RANK_THRESHOLDS) {
        expect(t.coins).toBe(expectedCoins[t.level]);
      }
    });
  });

  describe("Rank-up Bonuses in awardXP", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("awards starter badge on initial XP gain", async () => {
      const mockPassport = {
        id: "pass-1",
        userId: "user-1",
        paths: [{ path: UserPath.user, level: 1, totalXP: 0, currentXP: 0 }],
      };

      vi.spyOn(PassportSvc, "getOrCreate").mockResolvedValue(
        mockPassport as any,
      );
      vi.spyOn(PassportRepo, "upsertPath").mockResolvedValue({} as any);
      vi.spyOn(PassportRepo, "findPerksById").mockResolvedValue({
        perks: ["early_bird"],
      } as any);
      vi.spyOn(PassportRepo, "pushPerks").mockResolvedValue({} as any);
      const awardBadgeSpy = vi
        .spyOn(PassportSvc, "awardBadgeByName")
        .mockResolvedValue(undefined);

      await PassportSvc.awardXP("user-1", UserPath.user, 50);

      expect(awardBadgeSpy).toHaveBeenCalledWith("user-1", "Newcomer");
    });

    it("awards rank badge and rank-up coins when crossing level threshold", async () => {
      // User jumps from Level 2 to Level 3 (needs 530 XP, awarding 600)
      const mockPassport = {
        id: "pass-2",
        userId: "user-2",
        paths: [{ path: UserPath.user, level: 2, totalXP: 300, currentXP: 50 }],
      };

      vi.spyOn(PassportSvc, "getOrCreate").mockResolvedValue(
        mockPassport as any,
      );
      vi.spyOn(PassportRepo, "upsertPath").mockResolvedValue({} as any);
      const awardBadgeSpy = vi
        .spyOn(PassportSvc, "awardBadgeByName")
        .mockResolvedValue(undefined);
      vi.spyOn(RewardRepo, "findEventByIdempotencyKey").mockResolvedValue(null);
      const recordGrantSpy = vi
        .spyOn(RewardRepo, "recordGrant")
        .mockResolvedValue({} as any);

      const result = await PassportSvc.awardXP("user-2", UserPath.user, 300);

      expect(result.level).toBe(3);
      expect(awardBadgeSpy).toHaveBeenCalledWith("user-2", "Wanderer");
      // Allow async promise chain to run
      await new Promise((r) => setTimeout(r, 20));
      expect(recordGrantSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          path: UserPath.user,
          action: "rank_up",
          coins: 50,
          idempotencyKey: "grant:user-2:rank_up:user:3",
        }),
      );
    });
  });
});
