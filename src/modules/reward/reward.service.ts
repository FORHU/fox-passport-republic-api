import crypto from "node:crypto";
import { UserPath } from "@prisma/client";
import { AppError, notFound } from "../../utils/errors";
import RewardRepo from "./reward.repository";
import PassportSvc from "../passport/passport.service";
import PassportRepo from "../passport/passport.repository";
import RankSvc from "../passport/rank.service";
import {
  GrantRewardParams,
  GrantRewardResult,
  ReverseRewardParams,
  ReverseRewardResult,
  RewardCatalogItem,
  WalletSummary,
  WalletHistoryItem,
  RedeemRewardParams,
  RedeemRewardResult,
} from "./reward.types";

export default class RewardService {
  /**
   * Resolves rank title for a given level and path based on the 9-rank ladder.
   */
  static calculateRank(level: number, path: UserPath = UserPath.user): string {
    return RankSvc.nameForLevel(level, path);
  }

  /**
   * Calculates start of day in Asia/Manila timezone (UTC+8) to enforce server-side daily caps.
   */
  private static getStartOfDayManila(): Date {
    const now = new Date();
    // UTC time + 8 hours
    const manilaOffsetMs = 8 * 60 * 60 * 1000;
    const manilaTime = new Date(now.getTime() + manilaOffsetMs);

    manilaTime.setUTCHours(0, 0, 0, 0);
    return new Date(manilaTime.getTime() - manilaOffsetMs);
  }

  /**
   * Grants XP and Coins atomically and idempotently.
   * Enforces once-only rules, daily caps, and the 40% booking fee liability budget.
   */
  static async grant(params: GrantRewardParams): Promise<GrantRewardResult> {
    const path = params.path ?? UserPath.user;
    const idempotencyKey =
      params.idempotencyKey ||
      `grant:${params.userId}:${params.action}:${params.refType}:${params.refId}`;

    // 1. Idempotency Check
    const existingEvent =
      await RewardRepo.findEventByIdempotencyKey(idempotencyKey);
    if (existingEvent) {
      const passport = await PassportRepo.findByUserId(params.userId);
      const currentPath = passport?.paths.find((p) => p.path === path);
      const level = currentPath?.level ?? 1;

      return {
        xpAwarded: existingEvent.xp,
        coinsAwarded: existingEvent.coins,
        newLevel: level,
        newRank: this.calculateRank(level, path),
        isIdempotentReplay: true,
      };
    }

    // 2. Resolve Rule Configuration
    const rule = await RewardRepo.findRuleByAction(params.action);
    if (rule && !rule.active) {
      const passport = await PassportRepo.findByUserId(params.userId);
      const level = passport?.paths.find((p) => p.path === path)?.level ?? 1;
      return {
        xpAwarded: 0,
        coinsAwarded: 0,
        newLevel: level,
        newRank: this.calculateRank(level, path),
      };
    }

    let xpToAward = params.xpOverride ?? rule?.xp ?? 0;
    let coinsToAward = params.coinsOverride ?? rule?.coins ?? 0;

    // 3. Once-Only Check
    if (rule?.onceOnly) {
      const completed = await RewardRepo.hasUserCompletedAction(
        params.userId,
        params.action,
      );
      if (completed) {
        xpToAward = 0;
        coinsToAward = 0;
      }
    }

    // 4. Daily Cap Check
    if (
      rule?.dailyCap &&
      rule.dailyCap > 0 &&
      (xpToAward > 0 || coinsToAward > 0)
    ) {
      const startOfDay = this.getStartOfDayManila();
      const countToday = await RewardRepo.countDailyActions(
        params.userId,
        params.action,
        startOfDay,
      );
      if (countToday >= rule.dailyCap) {
        xpToAward = 0;
        coinsToAward = 0;
      }
    }

    // 5. Booking Fee Liability Budget Cap (Max 40% of collected platform fee)
    if (
      params.refType === "booking" &&
      params.bookingFeeAmount !== undefined &&
      coinsToAward > 0
    ) {
      if (params.bookingFeeAmount <= 0) {
        // Free events or zero platform fee bookings award zero coins
        coinsToAward = 0;
      } else {
        const feeNum = Number(params.bookingFeeAmount);
        const maxFeeBudgetPhp = feeNum * 0.4;
        const maxFeeBudgetCoinTotal = Math.floor(maxFeeBudgetPhp * 5); // 5 Coins = ₱1

        const alreadyGrantedCoins = await RewardRepo.getBookingCoinsGranted(
          params.refId,
        );
        const remainingBudget = Math.max(
          0,
          maxFeeBudgetCoinTotal - alreadyGrantedCoins,
        );

        coinsToAward = Math.min(coinsToAward, remainingBudget);
      }
    }

    // 6. Record Immutable Grant & Lifecycle in Database
    await RewardRepo.recordGrant({
      userId: params.userId,
      path,
      action: params.action,
      refType: params.refType,
      refId: params.refId,
      xp: xpToAward,
      coins: coinsToAward,
      idempotencyKey,
    });

    // 7. Progress XP, Levels, Badges, and Perks through Passport Service
    if (xpToAward > 0) {
      await PassportSvc.awardXP(params.userId, path, xpToAward);
    }

    const passport = await PassportRepo.findByUserId(params.userId);
    const updatedPath = passport?.paths.find((p) => p.path === path);
    const finalLevel = updatedPath?.level ?? 1;

    return {
      xpAwarded: xpToAward,
      coinsAwarded: coinsToAward,
      newLevel: finalLevel,
      newRank: this.calculateRank(finalLevel, path),
    };
  }

  /**
   * Reverses an existing grant on cancellation or refund by creating an append-only
   * REVERSAL lifecycle record and reversing XP on the user's path.
   */
  static async reverse(
    params: ReverseRewardParams,
  ): Promise<ReverseRewardResult> {
    const grantEvent = await RewardRepo.findEventByRef(
      params.refType,
      params.refId,
      params.action,
      params.userId,
    );

    if (!grantEvent) {
      return {
        reversed: false,
        xpReversed: 0,
        coinsReversed: 0,
      };
    }

    // Guard against duplicate reversals
    const alreadyReversed = await RewardRepo.isEventReversed(grantEvent.id);
    if (alreadyReversed) {
      return {
        reversed: false,
        xpReversed: 0,
        coinsReversed: 0,
        grantEventId: grantEvent.id,
      };
    }

    // 1. Record Append-Only Reversal in Ledger
    await RewardRepo.recordReversal({
      grantEventId: grantEvent.id,
      userId: grantEvent.userId,
      coinsToReverse: grantEvent.coins,
      reason: params.reason,
    });

    // 2. Reverse XP on Path
    if (grantEvent.xp > 0) {
      await PassportSvc.awardXP(
        grantEvent.userId,
        grantEvent.path,
        -grantEvent.xp,
      );
    }

    return {
      reversed: true,
      xpReversed: grantEvent.xp,
      coinsReversed: grantEvent.coins,
      grantEventId: grantEvent.id,
    };
  }

  /**
   * Gets spendable Coins balance.
   */
  static async getBalance(userId: string): Promise<number> {
    return RewardRepo.getCoinsBalance(userId);
  }

  /**
   * Retrieves the rewards catalog filtered by target audience and user level.
   */
  static async getCatalog(
    userId: string,
    targetAudience?: string,
    path: UserPath = UserPath.user,
  ): Promise<RewardCatalogItem[]> {
    const passport = await PassportRepo.findByUserId(userId);
    const coinsBalance = passport?.coins ?? 0;
    const currentPath = passport?.paths.find((p) => p.path === path);
    const userLevel = currentPath?.level ?? 1;

    const defaultAudience = path === UserPath.user ? "citizen" : "foxer";
    const audienceToFetch = targetAudience || defaultAudience;

    const rewards = await RewardRepo.findRewardsCatalog(audienceToFetch);

    return rewards.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      targetAudience: r.targetAudience,
      coinCost: r.coinCost,
      rewardType: r.rewardType,
      discountPhp: r.discountPhp ? Number(r.discountPhp) : null,
      discountPercentage: r.discountPercentage
        ? Number(r.discountPercentage)
        : null,
      minLevel: r.minLevel,
      canAfford: coinsBalance >= r.coinCost,
      levelQualified: userLevel >= r.minLevel,
    }));
  }

  /**
   * Retrieves user's wallet overview including spendable coins, level, rank, and ledger history.
   */
  static async getWallet(
    userId: string,
    path: UserPath = UserPath.user,
  ): Promise<WalletSummary> {
    const passport = await PassportRepo.findByUserId(userId);
    const currentPath = passport?.paths.find((p) => p.path === path);
    const level = currentPath?.level ?? 1;
    const coins = passport?.coins ?? 0;

    const { events, lifecycles } =
      await RewardRepo.getUserRewardHistory(userId);

    const history: WalletHistoryItem[] = [];

    for (const ev of events) {
      history.push({
        id: ev.id,
        type: "grant",
        action: ev.action,
        xp: ev.xp,
        coinsDelta: ev.coins,
        refType: ev.refType,
        refId: ev.refId,
        reason: `Earned from ${ev.action}`,
        createdAt: ev.createdAt,
      });
    }

    for (const lc of lifecycles) {
      history.push({
        id: lc.id,
        type: "lifecycle",
        lifecycleType: lc.type,
        xp: 0,
        coinsDelta: lc.coinsDelta,
        reason: lc.reason,
        createdAt: lc.createdAt,
      });
    }

    history.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const totalEarnedCoins = events.reduce((sum, e) => sum + e.coins, 0);

    return {
      coins,
      pendingCoins: 0,
      totalEarnedCoins,
      level,
      rank: this.calculateRank(level, path),
      history,
    };
  }

  /**
   * Redeems a coin reward: verifies eligibility, deducts coins, records REDEMPTION lifecycle,
   * and creates an owner-scoped voucher adhering to the 50% platform fee limit.
   */
  static async redeem(params: RedeemRewardParams): Promise<RedeemRewardResult> {
    const path = params.path ?? UserPath.user;
    const reward = await RewardRepo.findRewardById(params.rewardId);
    if (!reward || !reward.active) {
      throw notFound("Reward");
    }

    const passport = await PassportRepo.findByUserId(params.userId);
    if (!passport) {
      throw notFound("User passport");
    }

    const currentPath = passport.paths.find((p) => p.path === path);
    const userLevel = currentPath?.level ?? 1;

    if (userLevel < reward.minLevel) {
      throw new AppError(
        `Minimum level ${reward.minLevel} required to redeem this reward (your level is ${userLevel}).`,
        400,
      );
    }

    const currentBalance = passport.coins;
    if (currentBalance < reward.coinCost) {
      throw new AppError(
        `Insufficient coins. Required: ${reward.coinCost}, Available: ${currentBalance}.`,
        400,
      );
    }

    // Calculate minimum subtotal to ensure max 50% platform fee liability
    let minSubtotal = 0;
    if (reward.discountPhp) {
      // 5% default fee, max 50% discount -> minSubtotal = discount / 0.025
      minSubtotal = Math.ceil(Number(reward.discountPhp) * 40);
    }

    const voucherCode = `RWD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    try {
      const result = await RewardRepo.executeRedemptionTransaction({
        userId: params.userId,
        reward: {
          id: reward.id,
          title: reward.title,
          coinCost: reward.coinCost,
          rewardType: reward.rewardType,
          discountPhp: reward.discountPhp,
          discountPercentage: reward.discountPercentage,
        },
        expiresAt,
        voucherCode,
        minSubtotal,
      });

      return {
        success: true,
        redemptionId: result.redemption.id,
        coinsSpent: reward.coinCost,
        remainingCoins: result.remainingCoins,
        voucher: {
          id: result.voucher.id,
          code: result.voucher.code,
          discountPhp: reward.discountPhp ? Number(reward.discountPhp) : null,
          discountPercentage: reward.discountPercentage
            ? Number(reward.discountPercentage)
            : null,
          expiresAt,
        },
      };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "Insufficient coins balance."
      ) {
        throw new AppError("Insufficient coins balance.", 400);
      }
      throw err;
    }
  }
}
