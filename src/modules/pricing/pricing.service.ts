import { prisma } from "../../utils/prisma";
import { PlatformFeeConfig, Voucher, Promotion, Prisma } from "@prisma/client";
type Decimal = Prisma.Decimal;

export interface PricingContext {
  transactionType: string;
  category?: string;
  subcategory?: string;
  voucherCode?: string;
  userId?: string;
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
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gt: new Date() } }
        ]
      },
      orderBy: {
        priority: 'desc'
      }
    });

    let bestMatch: PlatformFeeConfig | null = null;
    let matchScore = -1;

    for (const rule of rules) {
      let score = 0;
      
      // Strict exclusions (if rule defines a context property, it must match)
      if (rule.transactionType && rule.transactionType !== context.transactionType) continue;
      if (rule.category && rule.category !== context.category) continue;
      if (rule.subcategory && rule.subcategory !== context.subcategory) continue;

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
   * Validates a voucher code against the context and calculates the discount amount.
   */
  static async validateAndCalculateVoucher(code: string, subtotal: number, context: PricingContext) {
    const voucher = await prisma.voucher.findUnique({
      where: { code },
      include: { promotion: true }
    });

    if (!voucher || !voucher.active || !voucher.promotion.active) {
      throw new Error("Invalid or inactive voucher code.");
    }

    const promo = voucher.promotion;
    const now = new Date();

    if (promo.startDate && promo.startDate > now) throw new Error("Voucher is not yet active.");
    if (promo.endDate && promo.endDate < now) throw new Error("Voucher has expired.");
    
    if (promo.minSubtotal && subtotal < promo.minSubtotal.toNumber()) {
      throw new Error(`Minimum subtotal of ${promo.minSubtotal.toNumber()} required for this voucher.`);
    }

    if (promo.transactionType && promo.transactionType !== context.transactionType) {
      throw new Error("Voucher not valid for this transaction type.");
    }

    if (promo.category && promo.category !== context.category) {
      throw new Error("Voucher not valid for this category.");
    }

    // Limits check
    if (promo.usageLimit !== null) {
      const globalUsage = await prisma.voucherRedemption.count({
        where: { voucher: { promotionId: promo.id } }
      });
      if (globalUsage >= promo.usageLimit) {
        throw new Error("Voucher usage limit reached.");
      }
    }

    if (promo.perUserLimit !== null && context.userId) {
      const userUsage = await prisma.voucherRedemption.count({
        where: { 
          voucher: { promotionId: promo.id },
          userId: context.userId
        }
      });
      if (userUsage >= promo.perUserLimit) {
        throw new Error("You have reached the usage limit for this voucher.");
      }
    }

    // Calculate discount
    let discountAmount = 0;
    const discountValueNum = promo.discountValue.toNumber();

    if (promo.discountType === "percentage") {
      discountAmount = (subtotal * discountValueNum) / 100;
    } else if (promo.discountType === "fixed") {
      discountAmount = discountValueNum;
    }

    if (promo.maxDiscount && discountAmount > promo.maxDiscount.toNumber()) {
      discountAmount = promo.maxDiscount.toNumber();
    }

    // Discount cannot exceed subtotal
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }

    return {
      voucher,
      promotion: promo,
      discountAmount
    };
  }

  /**
   * Calculates the full pricing breakdown sequentially:
   * Base Subtotal -> Discount -> Discounted Subtotal -> Platform Fee -> Final Amount
   */
  static async calculatePrice(subtotal: Decimal | number, context: PricingContext): Promise<PricingBreakdown> {
    const subtotalNum = subtotal instanceof Prisma.Decimal ? subtotal.toNumber() : subtotal;
    let discountAmount = 0;
    let appliedVoucher = null;

    // 1. Discount/Voucher
    if (context.voucherCode && context.userId) {
      const validated = await this.validateAndCalculateVoucher(context.voucherCode, subtotalNum, context);
      discountAmount = validated.discountAmount;
      appliedVoucher = {
        voucherId: validated.voucher.id,
        code: validated.voucher.code,
        type: validated.promotion.discountType,
        value: validated.promotion.discountValue.toNumber(),
        amount: discountAmount
      };
    }

    // 2. Discounted Subtotal
    const discountedSubtotal = subtotalNum - discountAmount;

    // 3. Platform Fee
    const resolvedRule = await this.resolvePricingRule(context);
    let platformFeeAmount = 0;
    let appliedRule = null;

    if (resolvedRule) {
      const percentageNum = resolvedRule.percentage ? resolvedRule.percentage.toNumber() : 0;
      const fixedAmountNum = resolvedRule.fixedAmount ? resolvedRule.fixedAmount.toNumber() : 0;
      
      platformFeeAmount = (discountedSubtotal * percentageNum) / 100 + fixedAmountNum;
      
      appliedRule = {
        ruleId: resolvedRule.id,
        name: resolvedRule.name,
        percentage: percentageNum,
        fixedAmount: fixedAmountNum,
        amount: platformFeeAmount
      };
    }

    // 4. Final Amount
    const finalAmount = discountedSubtotal + platformFeeAmount;

    return {
      subtotal: subtotalNum,
      discount: appliedVoucher,
      discountedSubtotal,
      platformFee: appliedRule,
      finalAmount
    };
  }
}
