import crypto from "node:crypto";
import { RewardLifecycleType, UserPath } from "@prisma/client";
import { AppError, notFound } from "../../utils/errors";
import RewardRepo from "./reward.repository";
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

/**
 * The one-time rewards whose Coins are held until the account's first attended
 * paid booking (requirements/xp-and-coins.md, section 3.1), so a new account
 * cannot farm free Coins without ever spending. The XP is paid at once.
 */
export const HELD_ACTIONS: ReadonlySet<string> = new Set([
  "finish_intro",
  "complete_profile",
  "verify_identity",
]);

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
   * Grants Tokens (the `coins` ledger) atomically and idempotently. XP is
   * retired (requirements/xp-and-coins.md, section 2): nothing earns it, and
   * the XP already stored stays as it is.
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
      return { coinsAwarded: existingEvent.coins, isIdempotentReplay: true };
    }

    // 2. Resolve Rule Configuration
    const rule = await RewardRepo.findRuleByAction(params.action);
    if (rule && !rule.active) {
      return { coinsAwarded: 0 };
    }

    let coinsToAward = params.coinsOverride ?? rule?.coins ?? 0;

    // 3. Once-Only Check
    if (rule?.onceOnly) {
      const completed = await RewardRepo.hasUserCompletedAction(
        params.userId,
        params.action,
      );
      if (completed) {
        coinsToAward = 0;
      }
    }

    // 4. Daily Cap Check
    const effectiveDailyCap =
      rule?.dailyCap ?? (params.action === "review_helpful" ? 5 : undefined);
    if (effectiveDailyCap && effectiveDailyCap > 0 && coinsToAward > 0) {
      const startOfDay = this.getStartOfDayManila();
      const countToday = await RewardRepo.countDailyActions(
        params.userId,
        params.action,
        startOfDay,
      );
      if (countToday >= effectiveDailyCap) {
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

    // The one-time Coins are held until a paid booking has been attended; once
    // one has, they are paid at once.
    const isPending =
      coinsToAward > 0 &&
      (params.holdUntilAttended === true ||
        (HELD_ACTIONS.has(params.action) &&
          !(await RewardRepo.hasPaidAttendance(params.userId))));

    // 6. Record Immutable Grant & Lifecycle in Database
    await RewardRepo.recordGrant({
      userId: params.userId,
      path,
      action: params.action,
      refType: params.refType,
      refId: params.refId,
      xp: 0,
      coins: coinsToAward,
      idempotencyKey,
      isPending,
    });

    // 6b. Attending a booking that paid a platform fee is what frees the held
    // Coins. Free bookings do not count.
    if (
      params.action === "attend_event" &&
      Number(params.bookingFeeAmount ?? 0) > 0
    ) {
      await RewardRepo.releasePendingGrants(
        params.userId,
        "Released after the first attended paid booking",
      );
    }

    return { coinsAwarded: coinsToAward };
  }

  /**
   * Reverses an existing grant on cancellation or refund by creating an append-only
   * REVERSAL lifecycle record. XP already stored is left as it is.
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
        coinsReversed: 0,
      };
    }

    // Guard against duplicate reversals
    const alreadyReversed = await RewardRepo.isEventReversed(grantEvent.id);
    if (alreadyReversed) {
      return {
        reversed: false,
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

    return {
      reversed: true,
      coinsReversed: grantEvent.coins,
      grantEventId: grantEvent.id,
    };
  }

  /**
   * Nightly: returns the full Token price of every Token voucher that expired
   * completely unused (requirements/xp-and-coins.md, section 3.4). Idempotent
   * per voucher; one failure is logged and does not stop the rest.
   */
  static async returnExpiredVouchers(
    now: Date = new Date(),
  ): Promise<{ returned: number; tokens: number; failed: number }> {
    const due = await RewardRepo.findExpiredUnusedRedemptions(now);
    let returned = 0;
    let tokens = 0;
    let failed = 0;
    for (const r of due) {
      if (!r.voucher) continue;
      try {
        const done = await RewardRepo.recordVoucherReturn({
          redemptionId: r.id,
          userId: r.userId,
          coins: r.coinsSpent,
          voucherCode: r.voucher.code,
        });
        if (done) {
          returned += 1;
          tokens += r.coinsSpent;
        }
      } catch (err) {
        failed += 1;
        console.error(`[RewardService] voucher return failed for ${r.id}`, err);
      }
    }
    return { returned, tokens, failed };
  }

  /**
   * Gets spendable Coins balance.
   */
  static async getBalance(userId: string): Promise<number> {
    return RewardRepo.getCoinsBalance(userId);
  }

  /**
   * Retrieves the rewards catalog filtered by target audience. There is no level
   * lock: anyone can redeem what they can afford.
   */
  static async getCatalog(
    userId: string,
    targetAudience?: string,
    path: UserPath = UserPath.user,
  ): Promise<RewardCatalogItem[]> {
    const passport = await PassportRepo.findByUserId(userId);
    const coinsBalance = passport?.coins ?? 0;

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
      canAfford: coinsBalance >= r.coinCost,
    }));
  }

  /**
   * Retrieves user's wallet overview: spendable Tokens, pending Tokens and ledger history.
   */
  static async getWallet(
    userId: string,
    _path: UserPath = UserPath.user,
  ): Promise<WalletSummary> {
    const passport = await PassportRepo.findByUserId(userId);
    const coins = passport?.coins ?? 0;

    const { events, lifecycles } =
      await RewardRepo.getUserRewardHistory(userId);

    const heldIds = await RewardRepo.getPendingEventIds(userId);
    const history: WalletHistoryItem[] = [];

    for (const ev of events) {
      history.push({
        id: ev.id,
        type: "grant",
        action: ev.action,
        coinsDelta: ev.coins,
        refType: ev.refType,
        refId: ev.refId,
        reason: `Earned from ${ev.action}`,
        isPending: heldIds.has(ev.id),
        createdAt: ev.createdAt,
      });
    }

    for (const lc of lifecycles) {
      // A release or reversal acts on its grant, so it shows what that grant
      // was for (refType/refId, e.g. the booking). `action` stays on grants
      // only, so clients keep labelling lifecycle rows by their reason.
      // Redemptions and voucher returns are tied to a voucher; the reason
      // names it.
      const ofGrant =
        lc.type === RewardLifecycleType.RELEASE ||
        lc.type === RewardLifecycleType.REVERSAL;
      history.push({
        id: lc.id,
        type: "lifecycle",
        lifecycleType: lc.type,
        coinsDelta: lc.coinsDelta,
        reason: lc.reason,
        ...(ofGrant && {
          refType: lc.grantEvent.refType,
          refId: lc.grantEvent.refId,
        }),
        createdAt: lc.createdAt,
      });
    }

    history.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const totalEarnedCoins = events.reduce((sum, e) => sum + e.coins, 0);

    return {
      coins,
      pendingCoins: await RewardRepo.getPendingCoins(userId),
      totalEarnedCoins,
      history,
    };
  }

  /**
   * Redeems a coin reward: verifies eligibility, deducts coins, records REDEMPTION lifecycle,
   * and creates an owner-scoped voucher adhering to the 50% platform fee limit.
   */
  static async redeem(params: RedeemRewardParams): Promise<RedeemRewardResult> {
    const reward = await RewardRepo.findRewardById(params.rewardId);
    if (!reward || !reward.active) {
      throw notFound("Reward");
    }

    const passport = await PassportRepo.findByUserId(params.userId);
    if (!passport) {
      throw notFound("User passport");
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
