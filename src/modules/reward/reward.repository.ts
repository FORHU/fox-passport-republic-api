import { Prisma, RewardLifecycleType, UserPath } from "@prisma/client";
import { prisma } from "../../utils/prisma";

export default class RewardRepo {
  /**
   * Finds an active reward rule by action name.
   */
  static async findRuleByAction(action: string) {
    return prisma.rewardRule.findUnique({
      where: { action },
    });
  }

  /**
   * Finds an existing grant event by unique idempotency key.
   */
  static async findEventByIdempotencyKey(idempotencyKey: string) {
    return prisma.rewardEvent.findUnique({
      where: { idempotencyKey },
      include: { lifecycles: true },
    });
  }

  /**
   * Finds all grant events matching a reference.
   */
  static async findEventsByRef(refType: string, refId: string) {
    return prisma.rewardEvent.findMany({
      where: { refType, refId },
      include: { lifecycles: true },
    });
  }

  /**
   * Finds a specific grant event by reference, action, and optional user.
   */
  static async findEventByRef(
    refType: string,
    refId: string,
    action?: string,
    userId?: string,
  ) {
    return prisma.rewardEvent.findFirst({
      where: {
        refType,
        refId,
        ...(action ? { action } : {}),
        ...(userId ? { userId } : {}),
      },
      include: { lifecycles: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Counts how many times a user earned from an action since a given time (e.g. today).
   */
  static async countDailyActions(
    userId: string,
    action: string,
    since: Date,
  ): Promise<number> {
    return prisma.rewardEvent.count({
      where: {
        userId,
        action,
        createdAt: { gte: since },
      },
    });
  }

  /**
   * Checks whether a user has already completed a once-only action.
   */
  static async hasUserCompletedAction(
    userId: string,
    action: string,
  ): Promise<boolean> {
    const existing = await prisma.rewardEvent.findFirst({
      where: { userId, action },
      select: { id: true },
    });
    return !!existing;
  }

  /**
   * Calculates total coins currently granted for a specific booking reference.
   */
  static async getBookingCoinsGranted(bookingId: string): Promise<number> {
    const events = await prisma.rewardEvent.findMany({
      where: {
        refType: "booking",
        refId: bookingId,
      },
      select: { coins: true },
    });
    return events.reduce((sum, e) => sum + e.coins, 0);
  }

  /**
   * Checks if an event has already been reversed.
   */
  static async isEventReversed(grantEventId: string): Promise<boolean> {
    const reversal = await prisma.rewardLifecycle.findFirst({
      where: {
        grantEventId,
        type: RewardLifecycleType.REVERSAL,
      },
      select: { id: true },
    });
    return !!reversal;
  }

  /**
   * Transactionally records an immutable grant, its initial lifecycle release,
   * and increments the cached passport coins balance.
   */
  static async recordGrant(data: {
    userId: string;
    path: UserPath;
    action: string;
    refType: string;
    refId: string;
    xp: number;
    coins: number;
    idempotencyKey: string;
    isPending?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Create the immutable grant record
      const event = await tx.rewardEvent.create({
        data: {
          userId: data.userId,
          path: data.path,
          action: data.action,
          refType: data.refType,
          refId: data.refId,
          xp: data.xp,
          coins: data.coins,
          idempotencyKey: data.idempotencyKey,
        },
      });

      // 2. If coins awarded and immediately available, record RELEASE lifecycle and update cached balance
      if (data.coins > 0 && !data.isPending) {
        await tx.rewardLifecycle.create({
          data: {
            grantEventId: event.id,
            userId: data.userId,
            type: RewardLifecycleType.RELEASE,
            coinsDelta: data.coins,
            reason: `Initial release for ${data.action}`,
          },
        });

        // Ensure passport exists and increment coins atomically
        await tx.passport.upsert({
          where: { userId: data.userId },
          create: {
            userId: data.userId,
            coins: data.coins,
          },
          update: {
            coins: { increment: data.coins },
          },
        });
      }

      return event;
    });
  }

  /**
   * Grants whose Coins are still held: they carry Coins and have neither been
   * released nor reversed.
   */
  private static pendingWhere(userId: string): Prisma.RewardEventWhereInput {
    return {
      userId,
      coins: { gt: 0 },
      lifecycles: {
        none: {
          type: {
            in: [RewardLifecycleType.RELEASE, RewardLifecycleType.REVERSAL],
          },
        },
      },
    };
  }

  /** The ids of a user's grants whose Coins are still held. */
  static async getPendingEventIds(userId: string): Promise<Set<string>> {
    const held = await prisma.rewardEvent.findMany({
      where: this.pendingWhere(userId),
      select: { id: true },
    });
    return new Set(held.map((e) => e.id));
  }

  /** The Coins held for a user, not yet spendable. */
  static async getPendingCoins(userId: string): Promise<number> {
    const held = await prisma.rewardEvent.findMany({
      where: this.pendingWhere(userId),
      select: { coins: true },
    });
    return held.reduce((sum, e) => sum + e.coins, 0);
  }

  /**
   * Whether a user has already had a paid booking attended: an attendance
   * grant that paid Coins, which only a booking with a platform fee can.
   */
  static async hasPaidAttendance(userId: string): Promise<boolean> {
    const found = await prisma.rewardEvent.findFirst({
      where: { userId, action: "attend_event", coins: { gt: 0 } },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * Releases every held grant of a user: one append-only RELEASE record per
   * grant, and the Coins added to the spendable balance, in one transaction.
   * Safe to call again: a released grant is no longer held.
   */
  static async releasePendingGrants(
    userId: string,
    reason: string,
  ): Promise<{ released: number; coins: number }> {
    return prisma.$transaction(async (tx) => {
      const held = await tx.rewardEvent.findMany({
        where: this.pendingWhere(userId),
        select: { id: true, coins: true },
      });
      if (held.length === 0) return { released: 0, coins: 0 };

      let total = 0;
      for (const event of held) {
        await tx.rewardLifecycle.create({
          data: {
            grantEventId: event.id,
            userId,
            type: RewardLifecycleType.RELEASE,
            coinsDelta: event.coins,
            reason,
          },
        });
        total += event.coins;
      }

      await tx.passport.upsert({
        where: { userId },
        create: { userId, coins: total },
        update: { coins: { increment: total } },
      });
      return { released: held.length, coins: total };
    });
  }

  /**
   * Transactionally records an append-only reversal lifecycle event
   * and deducts the cached passport coins balance.
   */
  static async recordReversal(data: {
    grantEventId: string;
    userId: string;
    coinsToReverse: number;
    reason?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Append REVERSAL lifecycle event linked via reversalOf
      const lifecycle = await tx.rewardLifecycle.create({
        data: {
          grantEventId: data.grantEventId,
          userId: data.userId,
          type: RewardLifecycleType.REVERSAL,
          coinsDelta: -Math.abs(data.coinsToReverse),
          reversalOf: data.grantEventId,
          reason: data.reason || "Booking refund or cancellation",
        },
      });

      // 2. Decrement cached passport coins, clamping to 0 if necessary. Coins
      // still held never reached the balance, so there is nothing to take
      // back; the reversal record alone stops them from ever being released.
      const wasReleased = await tx.rewardLifecycle.findFirst({
        where: {
          grantEventId: data.grantEventId,
          type: RewardLifecycleType.RELEASE,
        },
        select: { id: true },
      });
      if (data.coinsToReverse > 0 && wasReleased) {
        const passport = await tx.passport.findUnique({
          where: { userId: data.userId },
          select: { coins: true },
        });

        const currentCoins = passport?.coins ?? 0;
        const newCoins = Math.max(0, currentCoins - data.coinsToReverse);

        await tx.passport.update({
          where: { userId: data.userId },
          data: { coins: newCoins },
        });
      }

      return lifecycle;
    });
  }

  /**
   * Gets cached coins balance from Passport table.
   */
  static async getCoinsBalance(userId: string): Promise<number> {
    const passport = await prisma.passport.findUnique({
      where: { userId },
      select: { coins: true },
    });
    return passport?.coins ?? 0;
  }

  /**
   * Finds active coin rewards catalog items.
   */
  static async findRewardsCatalog(targetAudience?: string) {
    return prisma.coinReward.findMany({
      where: {
        active: true,
        ...(targetAudience && targetAudience !== "all"
          ? { OR: [{ targetAudience }, { targetAudience: "all" }] }
          : {}),
      },
      orderBy: [{ minLevel: "asc" }, { coinCost: "asc" }],
    });
  }

  /**
   * Finds a specific coin reward by ID.
   */
  static async findRewardById(id: string) {
    return prisma.coinReward.findUnique({
      where: { id },
    });
  }

  /**
   * Retrieves user reward events and lifecycle transactions for wallet history.
   */
  static async getUserRewardHistory(userId: string) {
    const [events, lifecycles] = await Promise.all([
      prisma.rewardEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.rewardLifecycle.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return { events, lifecycles };
  }

  /**
   * Transactionally executes coin deduction, Promotion/Voucher creation,
   * CoinRedemption tracking, and lifecycle logging.
   */
  /**
   * Token vouchers past their expiry that were never used and whose Tokens
   * have not been returned yet. A voucher counts as used while it has a
   * VoucherRedemption row; cancelling the booking deletes that row and frees
   * the voucher again.
   */
  static async findExpiredUnusedRedemptions(now: Date, take = 500) {
    return prisma.coinRedemption.findMany({
      where: {
        status: "completed",
        expiresAt: { lt: now },
        voucherId: { not: null },
        voucher: { redemptions: { none: {} } },
      },
      select: {
        id: true,
        userId: true,
        coinsSpent: true,
        voucher: { select: { code: true } },
      },
      orderBy: { expiresAt: "asc" },
      take,
    });
  }

  /**
   * Returns an expired, unused voucher's full Token price, once. Claiming the
   * redemption (status completed -> returned) and writing the VOUCHER_RETURN
   * row happen in one transaction, so a re-run or a parallel run pays nothing
   * more. The original REDEMPTION row is never changed; the return points to
   * it through `reversalOf`.
   */
  static async recordVoucherReturn(data: {
    redemptionId: string;
    userId: string;
    coins: number;
    voucherCode: string;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.coinRedemption.updateMany({
        where: { id: data.redemptionId, status: "completed" },
        data: { status: "returned" },
      });
      if (claimed.count === 0) return false;

      const redemptionRow = await tx.rewardLifecycle.findFirst({
        where: {
          userId: data.userId,
          type: RewardLifecycleType.REDEMPTION,
          reason: { endsWith: `(${data.voucherCode})` },
        },
        select: { id: true, grantEventId: true },
      });
      const grantEventId =
        redemptionRow?.grantEventId ??
        (
          await tx.rewardEvent.findFirst({
            where: { userId: data.userId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
        )?.id;
      if (!grantEventId) {
        throw new Error(
          `No ledger entry to attach the voucher return to (redemption ${data.redemptionId})`,
        );
      }

      await tx.rewardLifecycle.create({
        data: {
          grantEventId,
          userId: data.userId,
          type: RewardLifecycleType.VOUCHER_RETURN,
          coinsDelta: data.coins,
          reversalOf: redemptionRow?.id ?? null,
          reason: `VOUCHER_EXPIRED: Tokens returned for unused voucher ${data.voucherCode}`,
        },
      });
      await tx.passport.update({
        where: { userId: data.userId },
        data: { coins: { increment: data.coins } },
      });
      return true;
    });
  }

  static async executeRedemptionTransaction(data: {
    userId: string;
    reward: {
      id: string;
      title: string;
      coinCost: number;
      rewardType: string;
      discountPhp: Prisma.Decimal | null;
      discountPercentage: Prisma.Decimal | null;
    };
    expiresAt: Date;
    voucherCode: string;
    minSubtotal: number;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify user's spendable coins balance
      const passport = await tx.passport.findUnique({
        where: { userId: data.userId },
        select: { coins: true },
      });

      const currentCoins = passport?.coins ?? 0;
      if (currentCoins < data.reward.coinCost) {
        throw new Error("Insufficient coins balance.");
      }

      // 2. Decrement cached passport coins
      const updatedPassport = await tx.passport.update({
        where: { userId: data.userId },
        data: {
          coins: { decrement: data.reward.coinCost },
        },
      });

      // 3. Create Promotion
      const discountType = data.reward.discountPercentage
        ? "percentage"
        : "fixed";
      const discountVal = data.reward.discountPercentage
        ? data.reward.discountPercentage
        : (data.reward.discountPhp ?? new Prisma.Decimal(0));

      const promo = await tx.promotion.create({
        data: {
          name: `Reward: ${data.reward.title}`,
          discountType,
          discountValue: discountVal,
          minSubtotal: new Prisma.Decimal(data.minSubtotal),
          startDate: new Date(),
          endDate: data.expiresAt,
          usageLimit: 1,
          perUserLimit: 1,
          active: true,
        },
      });

      // 4. Create Voucher scoped to ownerUserId
      const voucher = await tx.voucher.create({
        data: {
          code: data.voucherCode,
          promotionId: promo.id,
          ownerUserId: data.userId,
          active: true,
        },
      });

      // 5. Create CoinRedemption record
      const redemption = await tx.coinRedemption.create({
        data: {
          userId: data.userId,
          rewardId: data.reward.id,
          coinsSpent: data.reward.coinCost,
          voucherId: voucher.id,
          status: "completed",
          expiresAt: data.expiresAt,
        },
      });

      // 6. Record REDEMPTION in RewardLifecycle
      const latestGrant = await tx.rewardEvent.findFirst({
        where: { userId: data.userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (latestGrant) {
        await tx.rewardLifecycle.create({
          data: {
            grantEventId: latestGrant.id,
            userId: data.userId,
            type: RewardLifecycleType.REDEMPTION,
            coinsDelta: -data.reward.coinCost,
            reason: `Redeemed ${data.reward.title} (${data.voucherCode})`,
          },
        });
      }

      return {
        redemption,
        voucher,
        remainingCoins: updatedPassport.coins,
      };
    });
  }
}
