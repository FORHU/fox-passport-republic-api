import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/**
 * Prisma access for the admin reward screens (RR-8, api#303, slice B): the
 * reward rules, milestones and their tiers, challenges, and the catalogue.
 * Rules and business checks live in the service.
 */
export default class RewardAdminRepo {
  // --- Reward rules -------------------------------------------------------

  static listRules() {
    return prisma.rewardRule.findMany({ orderBy: { action: "asc" } });
  }

  static findRule(id: string) {
    return prisma.rewardRule.findUnique({ where: { id } });
  }

  static updateRule(id: string, data: Prisma.RewardRuleUpdateInput) {
    return prisma.rewardRule.update({ where: { id }, data });
  }

  // --- Milestones and tiers ----------------------------------------------

  static listMilestones() {
    return prisma.milestone.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { tiers: { orderBy: { tier: "asc" } } },
    });
  }

  static findMilestone(id: string) {
    return prisma.milestone.findUnique({
      where: { id },
      include: { tiers: { orderBy: { tier: "asc" } } },
    });
  }

  static findMilestoneByKey(key: string) {
    return prisma.milestone.findUnique({ where: { key } });
  }

  static createMilestone(data: Prisma.MilestoneCreateInput) {
    return prisma.milestone.create({
      data,
      include: { tiers: { orderBy: { tier: "asc" } } },
    });
  }

  static updateMilestone(id: string, data: Prisma.MilestoneUpdateInput) {
    return prisma.milestone.update({
      where: { id },
      data,
      include: { tiers: { orderBy: { tier: "asc" } } },
    });
  }

  static createTier(data: Prisma.MilestoneTierUncheckedCreateInput) {
    return prisma.milestoneTier.create({ data });
  }

  static updateTier(id: string, data: Prisma.MilestoneTierUpdateInput) {
    return prisma.milestoneTier.update({ where: { id }, data });
  }

  static deleteTier(id: string) {
    return prisma.milestoneTier.delete({ where: { id } });
  }

  /**
   * Whether anyone has been paid, or is being held, Tokens for this tier.
   * Grants refer to a tier as "milestoneKey:tier", so deleting it would leave
   * them with nothing to release or take back from.
   */
  static async tierHasGrants(
    milestoneKey: string,
    tier: number,
  ): Promise<boolean> {
    const count = await prisma.rewardEvent.count({
      where: { action: "milestone_tier", refId: `${milestoneKey}:${tier}` },
    });
    return count > 0;
  }

  // --- Challenges ---------------------------------------------------------

  static listChallenges() {
    return prisma.challenge.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  static findChallenge(id: string) {
    return prisma.challenge.findUnique({ where: { id } });
  }

  static findChallengeByKey(key: string) {
    return prisma.challenge.findUnique({ where: { key } });
  }

  static createChallenge(data: Prisma.ChallengeCreateInput) {
    return prisma.challenge.create({ data });
  }

  static updateChallenge(id: string, data: Prisma.ChallengeUpdateInput) {
    return prisma.challenge.update({ where: { id }, data });
  }

  // --- Rewards catalogue --------------------------------------------------

  /** Every reward, switched off or not: an admin needs to see them all. */
  static listCatalog() {
    return prisma.coinReward.findMany({
      orderBy: [{ active: "desc" }, { coinCost: "asc" }, { createdAt: "asc" }],
    });
  }

  static findCatalogItem(id: string) {
    return prisma.coinReward.findUnique({ where: { id } });
  }

  static createCatalogItem(data: Prisma.CoinRewardCreateInput) {
    return prisma.coinReward.create({ data });
  }

  static updateCatalogItem(id: string, data: Prisma.CoinRewardUpdateInput) {
    return prisma.coinReward.update({ where: { id }, data });
  }
}
