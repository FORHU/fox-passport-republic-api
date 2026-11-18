import { Request, Response } from "express";
import Joi from "joi";
import {
  ChallengeWindow,
  MilestoneCounter,
  MilestoneCountMode,
} from "@prisma/client";
import { sendServerError } from "../../utils/errors";
import { VALIDATE_ALL, sendValidationError } from "../../utils/validation";
import RewardAdminSvc from "./reward-admin.service";

const actorOf = (req: Request) => ({
  userId: req.user!.userId,
  email: req.user!.email,
});

const MAX_TOKENS = 1_000_000;
const key = Joi.string()
  .pattern(/^[a-z][a-z0-9_]{1,39}$/)
  .messages({
    "string.pattern.base":
      "key must be 2 to 40 characters: lowercase letters, numbers and underscores, starting with a letter",
  });
const name = Joi.string().trim().min(1).max(80);
const description = Joi.string().trim().max(300).allow(null);
const tokens = Joi.number().integer().min(0).max(MAX_TOKENS);
const target = Joi.number().integer().min(1).max(MAX_TOKENS);
const sortOrder = Joi.number().integer().min(0).max(10_000);

const ID = Joi.object({ id: Joi.string().uuid().required() });
const TIER_PARAMS = ID.keys({
  tier: Joi.number().integer().min(1).max(50).required(),
});

// A field that is not listed is refused, not ignored. That is how a key, a
// counter, a challenge window or a reward type that must not change is kept
// from changing.
const RULE_PATCH = Joi.object({
  coins: tokens,
  dailyCap: Joi.number().integer().min(1).max(100_000).allow(null),
  onceOnly: Joi.boolean(),
  active: Joi.boolean(),
}).min(1);

const MILESTONE_CREATE = Joi.object({
  key: key.required(),
  name: name.required(),
  description,
  counter: Joi.string()
    .valid(...Object.values(MilestoneCounter))
    .required(),
  counts: Joi.string().valid(...Object.values(MilestoneCountMode)),
  active: Joi.boolean(),
  sortOrder,
});
const MILESTONE_PATCH = Joi.object({
  name,
  description,
  active: Joi.boolean(),
  sortOrder,
}).min(1);

const TIER_CREATE = Joi.object({
  tier: Joi.number().integer().min(1).max(50).required(),
  target: target.required(),
  tokens: tokens.required(),
  badgeName: Joi.string().trim().max(60).allow(null),
});
const TIER_PATCH = Joi.object({
  target,
  tokens,
  badgeName: Joi.string().trim().max(60).allow(null),
}).min(1);

const CHALLENGE_CREATE = Joi.object({
  key: key.required(),
  name: name.required(),
  description,
  period: Joi.string()
    .valid(...Object.values(ChallengeWindow))
    .required(),
  target: target.required(),
  tokens: tokens.required(),
  active: Joi.boolean(),
  startsAt: Joi.date().allow(null),
  endsAt: Joi.date().allow(null),
  sortOrder,
});
const CHALLENGE_PATCH = Joi.object({
  name,
  description,
  target,
  tokens,
  active: Joi.boolean(),
  startsAt: Joi.date().allow(null),
  endsAt: Joi.date().allow(null),
  sortOrder,
}).min(1);

const REWARD_TYPES = ["booking_voucher", "fee_discount", "listing_boost"];
const AUDIENCES = ["citizen", "foxer", "all"];
const CATALOG_CREATE = Joi.object({
  title: name.required(),
  description,
  targetAudience: Joi.string().valid(...AUDIENCES),
  coinCost: Joi.number().integer().min(1).max(MAX_TOKENS).required(),
  rewardType: Joi.string()
    .valid(...REWARD_TYPES)
    .required(),
  discountPhp: Joi.number().min(0).max(1_000_000).allow(null),
  discountPercentage: Joi.number().min(0).max(100).allow(null),
  active: Joi.boolean(),
});
const CATALOG_PATCH = Joi.object({
  title: name,
  description,
  targetAudience: Joi.string().valid(...AUDIENCES),
  coinCost: Joi.number().integer().min(1).max(MAX_TOKENS),
  discountPhp: Joi.number().min(0).max(1_000_000).allow(null),
  discountPercentage: Joi.number().min(0).max(100).allow(null),
  active: Joi.boolean(),
}).min(1);

type Handler = (req: Request) => Promise<{ status?: number; data?: unknown }>;

/** One place for validation errors, the response shape and server errors. */
function handle(run: Handler) {
  return async (req: Request, res: Response) => {
    try {
      const { status = 200, data } = await run(req);
      return status === 204
        ? res.status(204).end()
        : res.status(status).json({ success: true, data });
    } catch (e: unknown) {
      if (e instanceof Joi.ValidationError) {
        return sendValidationError(res, e, { success: true });
      }
      return sendServerError(res, e, { success: true });
    }
  };
}

const check = <T>(schema: Joi.ObjectSchema, input: unknown): T => {
  const { error, value } = schema.validate(input, VALIDATE_ALL);
  if (error) throw error;
  return value as T;
};

export default class RewardAdminCtrl {
  // Rules
  static listRules = handle(async () => ({
    data: await RewardAdminSvc.listRules(),
  }));
  static getRule = handle(async (req) => ({
    data: await RewardAdminSvc.getRule(
      check<{ id: string }>(ID, req.params).id,
    ),
  }));
  static updateRule = handle(async (req) => ({
    data: await RewardAdminSvc.updateRule(
      check<{ id: string }>(ID, req.params).id,
      check(RULE_PATCH, req.body),
      actorOf(req),
    ),
  }));

  // Milestones and tiers
  static listMilestones = handle(async () => ({
    data: await RewardAdminSvc.listMilestones(),
  }));
  static getMilestone = handle(async (req) => ({
    data: await RewardAdminSvc.getMilestone(
      check<{ id: string }>(ID, req.params).id,
    ),
  }));
  static createMilestone = handle(async (req) => ({
    status: 201,
    data: await RewardAdminSvc.createMilestone(
      check(MILESTONE_CREATE, req.body),
      actorOf(req),
    ),
  }));
  static updateMilestone = handle(async (req) => ({
    data: await RewardAdminSvc.updateMilestone(
      check<{ id: string }>(ID, req.params).id,
      check(MILESTONE_PATCH, req.body),
      actorOf(req),
    ),
  }));
  static createTier = handle(async (req) => ({
    status: 201,
    data: await RewardAdminSvc.createTier(
      check<{ id: string }>(ID, req.params).id,
      check(TIER_CREATE, req.body),
      actorOf(req),
    ),
  }));
  static updateTier = handle(async (req) => {
    const p = check<{ id: string; tier: number }>(TIER_PARAMS, req.params);
    return {
      data: await RewardAdminSvc.updateTier(
        p.id,
        p.tier,
        check(TIER_PATCH, req.body),
        actorOf(req),
      ),
    };
  });
  static deleteTier = handle(async (req) => {
    const p = check<{ id: string; tier: number }>(TIER_PARAMS, req.params);
    await RewardAdminSvc.deleteTier(p.id, p.tier, actorOf(req));
    return { status: 204 };
  });

  // Challenges
  static listChallenges = handle(async () => ({
    data: await RewardAdminSvc.listChallenges(),
  }));
  static getChallenge = handle(async (req) => ({
    data: await RewardAdminSvc.getChallenge(
      check<{ id: string }>(ID, req.params).id,
    ),
  }));
  static createChallenge = handle(async (req) => ({
    status: 201,
    data: await RewardAdminSvc.createChallenge(
      check(CHALLENGE_CREATE, req.body),
      actorOf(req),
    ),
  }));
  static updateChallenge = handle(async (req) => ({
    data: await RewardAdminSvc.updateChallenge(
      check<{ id: string }>(ID, req.params).id,
      check(CHALLENGE_PATCH, req.body),
      actorOf(req),
    ),
  }));

  // Catalogue
  static listCatalog = handle(async () => ({
    data: await RewardAdminSvc.listCatalog(),
  }));
  static getCatalogItem = handle(async (req) => ({
    data: await RewardAdminSvc.getCatalogItem(
      check<{ id: string }>(ID, req.params).id,
    ),
  }));
  static createCatalogItem = handle(async (req) => ({
    status: 201,
    data: await RewardAdminSvc.createCatalogItem(
      check(CATALOG_CREATE, req.body),
      actorOf(req),
    ),
  }));
  static updateCatalogItem = handle(async (req) => ({
    data: await RewardAdminSvc.updateCatalogItem(
      check<{ id: string }>(ID, req.params).id,
      check(CATALOG_PATCH, req.body),
      actorOf(req),
    ),
  }));

  // History, for any of the above by its id
  static history = handle(async (req) => ({
    data: await RewardAdminSvc.history(
      check<{ id: string }>(ID, req.params).id,
    ),
  }));
}
