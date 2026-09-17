import { prisma } from "../../utils/prisma";
import { PlatformFeeConfig, Prisma } from "@prisma/client";
type Decimal = Prisma.Decimal;

export interface PricingContext {
  transactionType: string;
  category?: string;
  subcategory?: string;
  voucherCode?: string;
  userId?: string;
  // Which specific listing is being booked — only meaningful for
  // asset/service bookings. Checked against a provider-owned voucher's
  // Promotion.assetId/serviceId (see below): a Foxer's own code only works
  // on the listing it was scoped to, never any other listing of theirs or
  // anyone else's.
  assetId?: string;
  serviceId?: string;
  venueId?: string;
}

export interface PricingBreakdown {
  subtotal: number;
  discount: {
    voucherId?: string;
    code?: string;
    type?: string;
    value?: number;
    amount: number;
  } | null;
  discountedSubtotal: number;
  platformFee: {
    ruleId?: string;
    name?: string;
    percentage?: number;
    fixedAmount?: number;
    amount: number;
  } | null;
  finalAmount: number;
}

export default class PricingSvc {
  /**
   * Resolves the most specific pricing rule based on context.
   */
  static async resolvePricingRule(context: PricingContext) {
    const rules = await prisma.platformFeeConfig.findMany({
      where: {
        active: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }],
      },
      orderBy: {
        priority: "desc",
      },
    });

    let bestMatch: PlatformFeeConfig | null = null;
    let matchScore = -1;

    for (const rule of rules) {
      let score = 0;

      // Strict exclusions (if rule defines a context property, it must match)
      if (
        rule.transactionType &&
        rule.transactionType !== context.transactionType
      )
        continue;
      if (rule.category && rule.category !== context.category) continue;
      if (rule.subcategory && rule.subcategory !== context.subcategory)
        continue;

      // Scoring
      if (rule.transactionType === context.transactionType) score += 10;
      if (rule.category === context.category) score += 100;
      if (rule.subcategory === context.subcategory) score += 1000;

      score += rule.priority; // Allow manual override

      if (score > matchScore) {
        matchScore = score;
        bestMatch = rule;
      }
    }

    return bestMatch;
  }

  /**
   * The eligibility rules shared by an explicitly-typed code
   * (`validateAndCalculateVoucher`, throws with a specific reason) and
   * auto-apply matching (`findAutoApplyDiscount`, silently skips whatever
   * doesn't qualify) — one place these checks live, so the two paths can
   * never drift apart on what counts as "valid right now."
   */
  private static evaluateVoucherEligibility(
    voucher: { active: boolean },
    promo: {
      active: boolean;
      startDate: Date | null;
      endDate: Date | null;
      minSubtotal: Decimal | null;
      transactionType: string | null;
      category: string | null;
      assetId: string | null;
      serviceId: string | null;
      venueId: string | null;
    },
    subtotal: number,
    context: PricingContext,
  ): { ok: true } | { ok: false; reason: string } {
    if (!voucher.active || !promo.active) {
      return { ok: false, reason: "Invalid or inactive voucher code." };
    }

    const now = new Date();
    if (promo.startDate && promo.startDate > now) {
      return { ok: false, reason: "Voucher is not yet active." };
    }
    if (promo.endDate && promo.endDate < now) {
      return { ok: false, reason: "Voucher has expired." };
    }
    if (promo.minSubtotal && subtotal < promo.minSubtotal.toNumber()) {
      return {
        ok: false,
        reason: `Minimum subtotal of ${promo.minSubtotal.toNumber()} required for this voucher.`,
      };
    }
    if (
      promo.transactionType &&
      promo.transactionType !== context.transactionType
    ) {
      return {
        ok: false,
        reason: "Voucher not valid for this transaction type.",
      };
    }
    if (promo.category && promo.category !== context.category) {
      return { ok: false, reason: "Voucher not valid for this category." };
    }
    // A Foxer-owned voucher only works on the exact listing it was scoped
    // to — an admin/platform-wide voucher (assetId/serviceId/venueId all
    // null) skips this check entirely.
    if (promo.assetId && promo.assetId !== context.assetId) {
      return { ok: false, reason: "Voucher not valid for this listing." };
    }
    if (promo.serviceId && promo.serviceId !== context.serviceId) {
      return { ok: false, reason: "Voucher not valid for this listing." };
    }
    if (promo.venueId && promo.venueId !== context.venueId) {
      return { ok: false, reason: "Voucher not valid for this listing." };
    }
    return { ok: true };
  }

  private static async checkVoucherLimits(
    promotionId: string,
    usageLimit: number | null,
    perUserLimit: number | null,
    userId: string | undefined,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (usageLimit !== null) {
      const globalUsage = await prisma.voucherRedemption.count({
        where: { voucher: { promotionId } },
      });
      if (globalUsage >= usageLimit) {
        return { ok: false, reason: "Voucher usage limit reached." };
      }
    }
    if (perUserLimit !== null && userId) {
      const userUsage = await prisma.voucherRedemption.count({
        where: { voucher: { promotionId }, userId },
      });
      if (userUsage >= perUserLimit) {
        return {
          ok: false,
          reason: "You have reached the usage limit for this voucher.",
        };
      }
    }
    return { ok: true };
  }

  private static calculateDiscountAmount(
    promo: {
      discountType: string;
      discountValue: Decimal;
      maxDiscount: Decimal | null;
    },
    subtotal: number,
  ): number {
    const discountValueNum = promo.discountValue.toNumber();
    let discountAmount =
      promo.discountType === "percentage"
        ? (subtotal * discountValueNum) / 100
        : discountValueNum;

    if (promo.maxDiscount && discountAmount > promo.maxDiscount.toNumber()) {
      discountAmount = promo.maxDiscount.toNumber();
    }
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }
    return discountAmount;
  }

  /**
   * Validates a voucher code against the context and calculates the discount amount.
   */
  static async validateAndCalculateVoucher(
    code: string,
    subtotal: number,
    context: PricingContext,
  ) {
    const voucher = await prisma.voucher.findUnique({
      where: { code },
      include: { promotion: true },
    });
    if (!voucher) throw new Error("Invalid or inactive voucher code.");

    const promo = voucher.promotion;
    const eligibility = this.evaluateVoucherEligibility(
      voucher,
      promo,
      subtotal,
      context,
    );
    if (!eligibility.ok) throw new Error(eligibility.reason);

    const limits = await this.checkVoucherLimits(
      promo.id,
      promo.usageLimit,
      promo.perUserLimit,
      context.userId,
    );
    if (!limits.ok) throw new Error(limits.reason);

    return {
      voucher,
      promotion: promo,
      discountAmount: this.calculateDiscountAmount(promo, subtotal),
    };
  }

  /**
   * Finds the best-for-the-citizen auto-apply promotion for this context, if
   * any — no code involved. "Best" = largest resulting discount among every
   * eligible `autoApply` promotion currently in scope; ties are broken by
   * whichever `Promotion` was created most recently. Returns null rather
   * than throwing when nothing qualifies, since silence is the correct UX
   * for a promotion nobody typed a code for.
   */
  static async findAutoApplyDiscount(
    subtotal: number,
    context: PricingContext,
    // Restricts candidates to Foxer-owned (assetId/serviceId/venueId set)
    // promotions — used by `resolveEventLineItemDiscounts` when scanning a
    // single Event line item, so a platform-wide auto-apply promo isn't
    // matched (and discounted) once per item; it's handled once against the
    // blended total by the ordinary unscoped call to this same method.
    options: { scopedOnly?: boolean } = {},
  ) {
    const candidates = await prisma.voucher.findMany({
      where: {
        active: true,
        promotion: {
          active: true,
          autoApply: true,
          ...(options.scopedOnly
            ? {
                OR: [
                  { assetId: { not: null } },
                  { serviceId: { not: null } },
                  { venueId: { not: null } },
                ],
              }
            : {}),
        },
      },
      include: { promotion: true },
      orderBy: { promotion: { createdAt: "desc" } },
    });

    let best: {
      voucher: (typeof candidates)[number];
      discountAmount: number;
    } | null = null;

    for (const voucher of candidates) {
      const promo = voucher.promotion;
      const eligibility = this.evaluateVoucherEligibility(
        voucher,
        promo,
        subtotal,
        context,
      );
      if (!eligibility.ok) continue;

      const limits = await this.checkVoucherLimits(
        promo.id,
        promo.usageLimit,
        promo.perUserLimit,
        context.userId,
      );
      if (!limits.ok) continue;

      const discountAmount = this.calculateDiscountAmount(promo, subtotal);
      if (!best || discountAmount > best.discountAmount) {
        best = { voucher, discountAmount };
      }
    }

    if (!best) return null;
    return {
      voucher: best.voucher,
      promotion: best.voucher.promotion,
      discountAmount: best.discountAmount,
    };
  }

  /**
   * Per-line-item discount resolution for a multi-provider Event checkout —
   * unlike `calculatePrice`, which treats the whole cart as one blended
   * subtotal, this lets each provider's own line item (venue/gear/talent)
   * carry its own Foxer-owned voucher, so that Foxer's own payout — not the
   * platform's — funds their own discount (see `PaymentPayoutSvc.
   * allocatePayouts`'s per-item discount handling).
   *
   * `explicitCodes` may contain any mix of scoped (Foxer-owned) and at most
   * one unscoped (platform-wide) code — unscoped codes aren't resolved here;
   * the caller runs its usual `calculatePrice` pass against the
   * item-discounted remainder for that (see `EventCheckoutSvc`). Throws on
   * anything a citizen actually typed and got wrong (invalid code, code
   * that matches nothing in this cart, two codes aimed at the same item,
   * more than one unscoped code) — silent skip is only correct for
   * auto-apply, which nobody explicitly asked for.
   */
  static async resolveEventLineItemDiscounts(
    items: {
      sourceId: string;
      amount: number;
      transactionType: string;
      category?: string;
      assetId?: string;
      serviceId?: string;
      venueId?: string;
    }[],
    explicitCodes: string[],
    userId: string,
  ): Promise<{
    itemDiscounts: Map<
      string,
      { voucherId: string; promotionId: string; discountAmount: number }
    >;
    blanketCode?: string;
  }> {
    const itemDiscounts = new Map<
      string,
      { voucherId: string; promotionId: string; discountAmount: number }
    >();
    const claimedItemIds = new Set<string>();
    let blanketCode: string | undefined;

    for (const raw of explicitCodes) {
      const code = raw.trim();
      if (!code) continue;

      const voucher = await prisma.voucher.findUnique({
        where: { code },
        include: { promotion: true },
      });
      if (!voucher)
        throw new Error(`Invalid or inactive voucher code: ${code}`);
      const promo = voucher.promotion;
      const isScoped = !!(promo.assetId || promo.serviceId || promo.venueId);

      if (!isScoped) {
        if (blanketCode) {
          throw new Error(
            "Only one platform-wide voucher may be used per checkout.",
          );
        }
        blanketCode = code;
        continue;
      }

      const item = items.find(
        (it) =>
          (promo.assetId && promo.assetId === it.assetId) ||
          (promo.serviceId && promo.serviceId === it.serviceId) ||
          (promo.venueId && promo.venueId === it.venueId),
      );
      if (!item) {
        throw new Error(
          `Voucher ${code} does not apply to anything in this event.`,
        );
      }
      if (claimedItemIds.has(item.sourceId)) {
        throw new Error(
          `More than one voucher was entered for the same item (${code}).`,
        );
      }

      const eligibility = this.evaluateVoucherEligibility(
        voucher,
        promo,
        item.amount,
        {
          transactionType: item.transactionType,
          category: item.category,
          assetId: item.assetId,
          serviceId: item.serviceId,
          venueId: item.venueId,
        },
      );
      if (!eligibility.ok) throw new Error(`${code}: ${eligibility.reason}`);

      const limits = await this.checkVoucherLimits(
        promo.id,
        promo.usageLimit,
        promo.perUserLimit,
        userId,
      );
      if (!limits.ok) throw new Error(`${code}: ${limits.reason}`);

      itemDiscounts.set(item.sourceId, {
        voucherId: voucher.id,
        promotionId: promo.id,
        discountAmount: this.calculateDiscountAmount(promo, item.amount),
      });
      claimedItemIds.add(item.sourceId);
    }

    // Auto-apply, scoped-only — only for items nobody typed a code for.
    for (const item of items) {
      if (claimedItemIds.has(item.sourceId)) continue;

      const auto = await this.findAutoApplyDiscount(
        item.amount,
        {
          transactionType: item.transactionType,
          category: item.category,
          assetId: item.assetId,
          serviceId: item.serviceId,
          venueId: item.venueId,
          userId,
        },
        { scopedOnly: true },
      );
      if (!auto) continue;

      itemDiscounts.set(item.sourceId, {
        voucherId: auto.voucher.id,
        promotionId: auto.promotion.id,
        discountAmount: auto.discountAmount,
      });
      claimedItemIds.add(item.sourceId);
    }

    return { itemDiscounts, blanketCode };
  }

  /**
   * Calculates the full pricing breakdown sequentially:
   * Base Subtotal -> Discount -> Discounted Subtotal -> Platform Fee -> Final Amount
   */
  static async calculatePrice(
    subtotal: Decimal | number,
    context: PricingContext,
  ): Promise<PricingBreakdown> {
    const subtotalNum =
      subtotal instanceof Prisma.Decimal ? subtotal.toNumber() : subtotal;
    let discountAmount = 0;
    let appliedVoucher = null;

    // 1. Discount/Voucher — an explicitly-typed code always wins; otherwise
    // fall back to whatever auto-apply promotion best matches, if any.
    if (context.voucherCode && context.userId) {
      const validated = await this.validateAndCalculateVoucher(
        context.voucherCode,
        subtotalNum,
        context,
      );
      discountAmount = validated.discountAmount;
      appliedVoucher = {
        voucherId: validated.voucher.id,
        code: validated.voucher.code,
        type: validated.promotion.discountType,
        value: validated.promotion.discountValue.toNumber(),
        amount: discountAmount,
      };
    } else if (context.userId) {
      const auto = await this.findAutoApplyDiscount(subtotalNum, context);
      if (auto) {
        discountAmount = auto.discountAmount;
        appliedVoucher = {
          voucherId: auto.voucher.id,
          code: auto.voucher.code,
          type: auto.promotion.discountType,
          value: auto.promotion.discountValue.toNumber(),
          amount: discountAmount,
        };
      }
    }

    // 2. Discounted Subtotal
    const discountedSubtotal = subtotalNum - discountAmount;

    // 3. Platform Fee
    const resolvedRule = await this.resolvePricingRule(context);
    let platformFeeAmount = 0;
    let appliedRule = null;

    if (resolvedRule) {
      const percentageNum = resolvedRule.percentage
        ? resolvedRule.percentage.toNumber()
        : 0;
      const fixedAmountNum = resolvedRule.fixedAmount
        ? resolvedRule.fixedAmount.toNumber()
        : 0;

      platformFeeAmount =
        (discountedSubtotal * percentageNum) / 100 + fixedAmountNum;

      appliedRule = {
        ruleId: resolvedRule.id,
        name: resolvedRule.name,
        percentage: percentageNum,
        fixedAmount: fixedAmountNum,
        amount: platformFeeAmount,
      };
    }

    // 4. Final Amount
    const finalAmount = discountedSubtotal + platformFeeAmount;

    return {
      subtotal: subtotalNum,
      discount: appliedVoucher,
      discountedSubtotal,
      platformFee: appliedRule,
      finalAmount,
    };
  }
}
