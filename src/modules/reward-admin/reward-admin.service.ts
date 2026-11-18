import { Prisma } from "@prisma/client";
import { AppError } from "../../utils/errors";
import {
  AuditActor,
  listAuditForTarget,
  recordChange,
} from "../audit/audit.service";
import RewardAdminRepo from "./reward-admin.repository";

/**
 * What an admin may change about the rewards (RR-8, api#303, slice B). Nothing
 * here writes a Token balance, and nothing that has paid anyone is deleted or
 * re-keyed:
 *
 * - Grants refer to a milestone tier as "milestoneKey:tier" and to a challenge
 *   period as "challengeKey:periodStart". So a key, a tier number and a
 *   challenge period never change after creation, and a tier that has paid or
 *   is holding Tokens cannot be deleted (create a new milestone instead).
 * - A milestone's counter and a challenge's window are fixed for the same
 *   reason: changing what is counted would re-read everyone's history.
 * - A reward in the catalogue is switched off, never deleted: redemptions
 *   belong to it, and deleting it would delete them.
 * - Reward rules are edited, not created or deleted: a rule only does anything
 *   if code grants for its `action`.
 *
 * Every real change is recorded with who made it and the values before and
 * after. A request that changes nothing writes nothing.
 */

export const REWARD_AUDIT = {
  rule: "rewardRule.change",
  milestoneCreate: "milestone.create",
  milestone: "milestone.change",
  tierCreate: "milestoneTier.create",
  tier: "milestoneTier.change",
  tierDelete: "milestoneTier.delete",
  challengeCreate: "challenge.create",
  challenge: "challenge.change",
  catalogCreate: "coinReward.create",
  catalog: "coinReward.change",
} as const;

const notFound = (what: string) => new AppError(`${what} not found`, 404);

/** A value as it is written to the audit log and compared for changes. */
function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value ?? null;
}

/** The fields of `patch` that really differ from `before`. */
function changesOf(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const previous: Record<string, unknown> = {};
  const current: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const was = plain(before[field]);
    const now = plain(value);
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      previous[field] = was;
      current[field] = now;
    }
  }
  return { previous, current, changed: Object.keys(current).length > 0 };
}

/** A tier needs more than the one before it: targets must grow with the tier. */
function assertGrowing(tiers: { tier: number; target: number }[]) {
  const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].target <= sorted[i - 1].target) {
      throw new AppError(
        `Tier ${sorted[i].tier} must need more than tier ${sorted[i - 1].tier}: targets have to grow with each tier.`,
        400,
      );
    }
  }
}

function assertWindow(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new AppError("A challenge must end after it starts.", 400);
  }
}

/** A discount reward needs a discount; a boost has none. */
function assertDiscount(
  rewardType: string,
  discountPhp: unknown,
  discountPercentage: unknown,
) {
  const php = Number(plain(discountPhp) ?? 0);
  const pct = Number(plain(discountPercentage) ?? 0);
  if (rewardType === "listing_boost") {
    if (php > 0 || pct > 0) {
      throw new AppError("A listing boost has no discount amount.", 400);
    }
    return;
  }
  if (php <= 0 && pct <= 0) {
    throw new AppError(
      "A discount reward needs a peso amount or a percentage.",
      400,
    );
  }
}

type Row = Record<string, unknown>;

const catalogView = <
  T extends { discountPhp: unknown; discountPercentage: unknown },
>(
  item: T,
) => ({
  ...item,
  discountPhp: plain(item.discountPhp) as number | null,
  discountPercentage: plain(item.discountPercentage) as number | null,
});

export default class RewardAdminService {
  // --- Reward rules -------------------------------------------------------

  static listRules() {
    return RewardAdminRepo.listRules();
  }

  static async getRule(id: string) {
    const rule = await RewardAdminRepo.findRule(id);
    if (!rule) throw notFound("Reward rule");
    return rule;
  }

  static async updateRule(
    id: string,
    patch: {
      coins?: number;
      dailyCap?: number | null;
      onceOnly?: boolean;
      active?: boolean;
    },
    actor: AuditActor,
  ) {
    const rule = await this.getRule(id);
    const change = changesOf(rule as unknown as Row, patch);
    if (!change.changed) return rule;
    const updated = await RewardAdminRepo.updateRule(id, patch);
    await recordChange(actor, REWARD_AUDIT.rule, id, {
      action: rule.action,
      previous: change.previous,
      current: change.current,
    });
    return updated;
  }

  // --- Milestones and tiers ----------------------------------------------

  static listMilestones() {
    return RewardAdminRepo.listMilestones();
  }

  static async getMilestone(id: string) {
    const milestone = await RewardAdminRepo.findMilestone(id);
    if (!milestone) throw notFound("Milestone");
    return milestone;
  }

  static async createMilestone(
    input: {
      key: string;
      name: string;
      description?: string | null;
      counter: Prisma.MilestoneCreateInput["counter"];
      counts?: Prisma.MilestoneCreateInput["counts"];
      active?: boolean;
      sortOrder?: number;
    },
    actor: AuditActor,
  ) {
    if (await RewardAdminRepo.findMilestoneByKey(input.key)) {
      throw new AppError(
        `A milestone with the key "${input.key}" exists.`,
        409,
      );
    }
    const created = await RewardAdminRepo.createMilestone(input);
    await recordChange(actor, REWARD_AUDIT.milestoneCreate, created.id, {
      current: input,
    });
    return created;
  }

  static async updateMilestone(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      active?: boolean;
      sortOrder?: number;
    },
    actor: AuditActor,
  ) {
    const milestone = await this.getMilestone(id);
    const change = changesOf(milestone as unknown as Row, patch);
    if (!change.changed) return milestone;
    const updated = await RewardAdminRepo.updateMilestone(id, patch);
    await recordChange(actor, REWARD_AUDIT.milestone, id, {
      key: milestone.key,
      previous: change.previous,
      current: change.current,
    });
    return updated;
  }

  static async createTier(
    milestoneId: string,
    input: {
      tier: number;
      target: number;
      tokens: number;
      badgeName?: string | null;
    },
    actor: AuditActor,
  ) {
    const milestone = await this.getMilestone(milestoneId);
    if (milestone.tiers.some((t) => t.tier === input.tier)) {
      throw new AppError(`Tier ${input.tier} already exists.`, 409);
    }
    assertGrowing([...milestone.tiers, input]);
    const created = await RewardAdminRepo.createTier({
      milestoneId,
      ...input,
    });
    await recordChange(actor, REWARD_AUDIT.tierCreate, milestoneId, {
      key: milestone.key,
      tier: input.tier,
      current: input,
    });
    return created;
  }

  static async updateTier(
    milestoneId: string,
    tierNumber: number,
    patch: { target?: number; tokens?: number; badgeName?: string | null },
    actor: AuditActor,
  ) {
    const milestone = await this.getMilestone(milestoneId);
    const tier = milestone.tiers.find((t) => t.tier === tierNumber);
    if (!tier) throw notFound(`Tier ${tierNumber}`);
    const change = changesOf(tier as unknown as Row, patch);
    if (!change.changed) return tier;
    if (patch.target !== undefined) {
      assertGrowing(
        milestone.tiers.map((t) =>
          t.tier === tierNumber ? { tier: t.tier, target: patch.target! } : t,
        ),
      );
    }
    const updated = await RewardAdminRepo.updateTier(tier.id, patch);
    await recordChange(actor, REWARD_AUDIT.tier, milestoneId, {
      key: milestone.key,
      tier: tierNumber,
      previous: change.previous,
      current: change.current,
    });
    return updated;
  }

  static async deleteTier(
    milestoneId: string,
    tierNumber: number,
    actor: AuditActor,
  ) {
    const milestone = await this.getMilestone(milestoneId);
    const tier = milestone.tiers.find((t) => t.tier === tierNumber);
    if (!tier) throw notFound(`Tier ${tierNumber}`);
    if (await RewardAdminRepo.tierHasGrants(milestone.key, tierNumber)) {
      throw new AppError(
        "This tier has paid, or is holding, Tokens for someone, so it cannot be deleted. Switch the milestone off, or add a new milestone.",
        409,
      );
    }
    await RewardAdminRepo.deleteTier(tier.id);
    await recordChange(actor, REWARD_AUDIT.tierDelete, milestoneId, {
      key: milestone.key,
      tier: tierNumber,
      previous: {
        target: tier.target,
        tokens: tier.tokens,
        badgeName: tier.badgeName,
      },
    });
  }

  // --- Challenges ---------------------------------------------------------

  static listChallenges() {
    return RewardAdminRepo.listChallenges();
  }

  static async getChallenge(id: string) {
    const challenge = await RewardAdminRepo.findChallenge(id);
    if (!challenge) throw notFound("Challenge");
    return challenge;
  }

  static async createChallenge(
    input: {
      key: string;
      name: string;
      description?: string | null;
      period: Prisma.ChallengeCreateInput["period"];
      target: number;
      tokens: number;
      active?: boolean;
      startsAt?: Date | null;
      endsAt?: Date | null;
      sortOrder?: number;
    },
    actor: AuditActor,
  ) {
    if (await RewardAdminRepo.findChallengeByKey(input.key)) {
      throw new AppError(
        `A challenge with the key "${input.key}" exists.`,
        409,
      );
    }
    assertWindow(input.startsAt ?? null, input.endsAt ?? null);
    const created = await RewardAdminRepo.createChallenge(input);
    await recordChange(actor, REWARD_AUDIT.challengeCreate, created.id, {
      current: input,
    });
    return created;
  }

  static async updateChallenge(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      target?: number;
      tokens?: number;
      active?: boolean;
      startsAt?: Date | null;
      endsAt?: Date | null;
      sortOrder?: number;
    },
    actor: AuditActor,
  ) {
    const challenge = await this.getChallenge(id);
    const change = changesOf(challenge as unknown as Row, patch);
    if (!change.changed) return challenge;
    assertWindow(
      patch.startsAt === undefined ? challenge.startsAt : patch.startsAt,
      patch.endsAt === undefined ? challenge.endsAt : patch.endsAt,
    );
    const updated = await RewardAdminRepo.updateChallenge(id, patch);
    await recordChange(actor, REWARD_AUDIT.challenge, id, {
      key: challenge.key,
      previous: change.previous,
      current: change.current,
    });
    return updated;
  }

  // --- Rewards catalogue --------------------------------------------------

  static async listCatalog() {
    return (await RewardAdminRepo.listCatalog()).map(catalogView);
  }

  static async getCatalogItem(id: string) {
    const item = await RewardAdminRepo.findCatalogItem(id);
    if (!item) throw notFound("Reward");
    return catalogView(item);
  }

  static async createCatalogItem(
    input: {
      title: string;
      description?: string | null;
      targetAudience?: string;
      coinCost: number;
      rewardType: string;
      discountPhp?: number | null;
      discountPercentage?: number | null;
      active?: boolean;
    },
    actor: AuditActor,
  ) {
    assertDiscount(
      input.rewardType,
      input.discountPhp,
      input.discountPercentage,
    );
    const created = await RewardAdminRepo.createCatalogItem(input);
    await recordChange(actor, REWARD_AUDIT.catalogCreate, created.id, {
      current: input,
    });
    return catalogView(created);
  }

  static async updateCatalogItem(
    id: string,
    patch: {
      title?: string;
      description?: string | null;
      targetAudience?: string;
      coinCost?: number;
      discountPhp?: number | null;
      discountPercentage?: number | null;
      active?: boolean;
    },
    actor: AuditActor,
  ) {
    const item = await this.getCatalogItem(id);
    const change = changesOf(item as unknown as Row, patch);
    if (!change.changed) return catalogView(item);
    assertDiscount(
      item.rewardType,
      patch.discountPhp === undefined ? item.discountPhp : patch.discountPhp,
      patch.discountPercentage === undefined
        ? item.discountPercentage
        : patch.discountPercentage,
    );
    const updated = await RewardAdminRepo.updateCatalogItem(id, patch);
    await recordChange(actor, REWARD_AUDIT.catalog, id, {
      title: item.title,
      previous: change.previous,
      current: change.current,
    });
    return catalogView(updated);
  }

  // --- History ------------------------------------------------------------

  /** Who changed what, newest first, for any of the above by its id. */
  static history(id: string, limit = 100) {
    return listAuditForTarget(id, limit);
  }
}
