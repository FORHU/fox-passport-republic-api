import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, RewardLifecycleType, UserPath } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import RewardRepo from "../src/modules/reward/reward.repository";
import RewardService from "../src/modules/reward/reward.service";

/**
 * A Token voucher that expires completely unused gives its full Token price
 * back, once (requirements/xp-and-coins.md, section 3.4). A used voucher is
 * never returned.
 */
describe("RewardService.returnExpiredVouchers — Tokens back for unused expired vouchers", () => {
  const runId = Math.random().toString(36).substring(7);
  let userId: string;
  let rewardId: string;
  let unusedRedemptionId: string;
  let usedRedemptionId: string;
  const promotionIds: string[] = [];

  const redeem = async (code: string) => {
    const result = await RewardRepo.executeRedemptionTransaction({
      userId,
      reward: {
        id: rewardId,
        title: "₱20 Booking Discount",
        coinCost: 100,
        rewardType: "booking_voucher",
        discountPhp: new Prisma.Decimal(20),
        discountPercentage: null,
      },
      // Already expired, as if 30 days had passed
      expiresAt: new Date(Date.now() - 60 * 1000),
      voucherCode: code,
      minSubtotal: 800,
    });
    promotionIds.push(result.voucher.promotionId);
    return result;
  };

  const coins = async () =>
    (await prisma.passport.findUnique({ where: { userId } }))?.coins ?? 0;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `voucher_return_${runId}@test.com`,
        password: "pw",
        name: "Voucher Return",
      },
    });
    userId = user.id;
    await prisma.passport.create({ data: { userId, coins: 300 } });
    await prisma.rewardEvent.create({
      data: {
        userId,
        path: UserPath.user,
        action: "attend_event",
        refType: "booking",
        refId: `b-${runId}`,
        coins: 300,
        idempotencyKey: `grant:${userId}:attend_event:${runId}`,
      },
    });
    const reward = await prisma.coinReward.create({
      data: {
        title: `₱20 ${runId}`,
        coinCost: 100,
        rewardType: "booking_voucher",
        discountPhp: new Prisma.Decimal(20),
      },
    });
    rewardId = reward.id;

    const unused = await redeem(`RWD-UNUSED-${runId}`);
    unusedRedemptionId = unused.redemption.id;

    const used = await redeem(`RWD-USED-${runId}`);
    usedRedemptionId = used.redemption.id;
    await prisma.voucherRedemption.create({
      data: {
        voucherId: used.voucher.id,
        userId,
        discountAmount: new Prisma.Decimal(20),
      },
    });
  });

  afterAll(async () => {
    await prisma.voucherRedemption.deleteMany({ where: { userId } });
    await prisma.coinRedemption.deleteMany({ where: { userId } });
    await prisma.voucher.deleteMany({ where: { ownerUserId: userId } });
    await prisma.promotion.deleteMany({ where: { id: { in: promotionIds } } });
    await prisma.coinReward.deleteMany({ where: { id: rewardId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("returns the unused voucher's Tokens once, linked to its REDEMPTION row", async () => {
    expect(await coins()).toBe(100); // 300 - 2 x 100

    const first = await RewardService.returnExpiredVouchers();
    expect(first.failed).toBe(0);
    expect(await coins()).toBe(200);

    const returns = await prisma.rewardLifecycle.findMany({
      where: { userId, type: RewardLifecycleType.VOUCHER_RETURN },
    });
    expect(returns).toHaveLength(1);
    expect(returns[0].coinsDelta).toBe(100);
    expect(returns[0].reason).toMatch(/^VOUCHER_EXPIRED/);

    const redemptionRow = await prisma.rewardLifecycle.findFirst({
      where: {
        userId,
        type: RewardLifecycleType.REDEMPTION,
        reason: { endsWith: `(RWD-UNUSED-${runId})` },
      },
    });
    expect(returns[0].reversalOf).toBe(redemptionRow?.id);
    expect(redemptionRow?.coinsDelta).toBe(-100); // never changed

    const unused = await prisma.coinRedemption.findUnique({
      where: { id: unusedRedemptionId },
    });
    expect(unused?.status).toBe("returned");
  });

  it("pays nothing more when the job runs again", async () => {
    await RewardService.returnExpiredVouchers();
    expect(await coins()).toBe(200);
    expect(
      await prisma.rewardLifecycle.count({
        where: { userId, type: RewardLifecycleType.VOUCHER_RETURN },
      }),
    ).toBe(1);
  });

  it("never returns a voucher that was used on a booking", async () => {
    const used = await prisma.coinRedemption.findUnique({
      where: { id: usedRedemptionId },
    });
    expect(used?.status).toBe("completed");
  });
});
