import { prisma } from "../../utils/prisma";

export default class PromotionRepo {
  static async findAll(includeInactive = false) {
    return prisma.promotion.findMany({
      where: includeInactive ? {} : { active: true },
      include: {
        vouchers: { include: { _count: { select: { redemptions: true } } } },
      },
      orderBy: { createdAt: "desc" },
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
      include: {
        vouchers: { include: { _count: { select: { redemptions: true } } } },
      },
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
    return prisma.voucher.findFirst({ where: { promotionId } });
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
