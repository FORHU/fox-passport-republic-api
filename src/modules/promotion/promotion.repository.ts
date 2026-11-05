import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { AUTO_APPLY_CODE_PREFIX } from "./promotion.constants";

/**
 * The codes a person can see and hand out: every voucher except an
 * auto-apply promotion's hidden anchor. Decided here, once, so no client has
 * to filter a list it was given.
 */
const VISIBLE_CODES = {
  NOT: { code: { startsWith: `${AUTO_APPLY_CODE_PREFIX}-` } },
} satisfies Prisma.VoucherWhereInput;

/** A promotion as the API returns it: its visible codes and how many. */
const WITH_VISIBLE_CODES = {
  vouchers: {
    where: VISIBLE_CODES,
    include: { _count: { select: { redemptions: true } } },
  },
  _count: { select: { vouchers: { where: VISIBLE_CODES } } },
} satisfies Prisma.PromotionInclude;

export default class PromotionRepo {
  static async findAll(includeInactive = false) {
    return prisma.promotion.findMany({
      where: includeInactive ? {} : { active: true },
      include: WITH_VISIBLE_CODES,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * One promotion for a response. `findById` stays unfiltered: the service
   * also uses it for existence checks and for the audit `previous` snapshot,
   * which keeps recording every voucher exactly as before.
   */
  static async findByIdWithVisibleCodes(id: string) {
    return prisma.promotion.findUnique({
      where: { id },
      include: WITH_VISIBLE_CODES,
    });
  }

  static async findById(id: string) {
    return prisma.promotion.findUnique({
      where: { id },
      include: {
        vouchers: { include: { _count: { select: { redemptions: true } } } },
      },
    });
  }

  static async findAllForProvider(providerId: string) {
    return prisma.promotion.findMany({
      where: { providerId },
      include: WITH_VISIBLE_CODES,
      orderBy: { createdAt: "desc" },
    });
  }

  static async create(data: {
    name: string;
    description?: string | null;
    transactionType?: string | null;
    category?: string | null;
    subcategory?: string | null;
    providerId?: string | null;
    assetId?: string | null;
    serviceId?: string | null;
    venueId?: string | null;
    discountType: string;
    discountValue: number;
    minSubtotal?: number | null;
    maxDiscount?: number | null;
    startDate?: Date | null;
    endDate?: Date | null;
    usageLimit?: number | null;
    perUserLimit?: number | null;
    autoApply?: boolean;
  }) {
    return prisma.promotion.create({ data });
  }

  static async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      transactionType: string | null;
      category: string | null;
      subcategory: string | null;
      discountType: string;
      discountValue: number;
      minSubtotal: number | null;
      maxDiscount: number | null;
      active: boolean;
      startDate: Date | null;
      endDate: Date | null;
      usageLimit: number | null;
      perUserLimit: number | null;
      autoApply: boolean;
    }>,
  ) {
    return prisma.promotion.update({ where: { id }, data });
  }

  static async softDelete(id: string) {
    return prisma.promotion.update({ where: { id }, data: { active: false } });
  }

  static async createVouchers(promotionId: string, codes: string[]) {
    // createMany skips duplicates by default only with `skipDuplicates` —
    // codes are globally unique (@unique on Voucher.code), so a collision
    // here means the caller's generator produced one; let it surface rather
    // than silently dropping a requested voucher.
    await prisma.voucher.createMany({
      data: codes.map((code) => ({ code, promotionId })),
    });
    return prisma.voucher.findMany({
      where: { promotionId, code: { in: codes } },
    });
  }

  static async setVoucherActive(id: string, active: boolean) {
    return prisma.voucher.update({ where: { id }, data: { active } });
  }

  static async findAutoApplyVoucher(promotionId: string) {
    // The anchor only. Matching any voucher meant a promotion that already
    // had printed codes, once switched to auto-apply, adopted one of them as
    // its hidden anchor and never got a real one.
    return prisma.voucher.findFirst({
      where: {
        promotionId,
        code: { startsWith: `${AUTO_APPLY_CODE_PREFIX}-` },
      },
    });
  }

  static async findVoucherWithPromotion(voucherId: string) {
    return prisma.voucher.findUnique({
      where: { id: voucherId },
      include: { promotion: true },
    });
  }

  static async codeExists(code: string) {
    return (await prisma.voucher.count({ where: { code } })) > 0;
  }

  /**
   * Deletes the `VoucherRedemption` row for a cancelled/refunded booking, if
   * one exists — releasing its slot against `usageLimit`/`perUserLimit`
   * (both are `count()`s over this table, not a counter column, so deleting
   * the row is the entire fix). A no-op when there was no voucher on the
   * booking to begin with. Exactly one of the three keys should be set by
   * the caller, matching the "exactly one FK set" invariant on the table.
   */
  static async releaseRedemption(match: {
    assetBookingId?: string;
    serviceBookingId?: string;
    eventId?: string;
  }) {
    await prisma.voucherRedemption.deleteMany({ where: match });
  }

  /**
   * Releases every redemption tied to an Event's Invoice — the blanket
   * (whole-invoice) one and every per-line-item one, if any — for
   * `EventCheckoutSvc.cancelEvent`. Both kinds carry the same `invoiceId`
   * (see the schema comment on `VoucherRedemption`), so one delete covers
   * the lot; there's no partial-cancel path that would need to keep some.
   */
  static async releaseInvoiceRedemptions(invoiceId: string) {
    await prisma.voucherRedemption.deleteMany({ where: { invoiceId } });
  }

  static async getRedemptionAnalytics(promotionId: string) {
    const redemptions = await prisma.voucherRedemption.findMany({
      where: { voucher: { promotionId } },
      select: { discountAmount: true, redeemedAt: true },
    });
    return redemptions;
  }
}
