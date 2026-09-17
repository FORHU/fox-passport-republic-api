import crypto from "crypto";
import PromotionRepo from "./promotion.repository";
import AssetRepo from "../asset/asset.repository";
import ServiceRepo from "../service/service.repository";
import VenueRepo from "../venue/venue.repository";

interface PromotionInput {
  name: string;
  description?: string | null;
  transactionType?: string | null;
  category?: string | null;
  subcategory?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minSubtotal?: number | null;
  maxDiscount?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  autoApply?: boolean;
}

/** What a Foxer sends when creating a voucher scoped to their own listing. */
interface OwnPromotionInput {
  name: string;
  description?: string | null;
  assetId?: string | null;
  serviceId?: string | null;
  venueId?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minSubtotal?: number | null;
  maxDiscount?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  autoApply?: boolean;
}

// Excludes visually ambiguous characters (0/O, 1/I/L) — these get typed by
// hand at checkout, unlike most other generated ids in this codebase.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length: number): string {
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function assertValidPromotion(data: PromotionInput) {
  if (!data.name?.trim()) throw new Error("Promotion name is required");
  if (!["percentage", "fixed"].includes(data.discountType)) {
    throw new Error('discountType must be "percentage" or "fixed"');
  }
  if (data.discountValue == null || data.discountValue <= 0) {
    throw new Error("discountValue must be greater than 0");
  }
  if (data.discountType === "percentage" && data.discountValue > 100) {
    throw new Error("A percentage discount cannot exceed 100");
  }
  if (data.startDate && data.endDate && data.endDate <= data.startDate) {
    throw new Error("endDate must be after startDate");
  }
}

// Prisma's `Decimal` fields serialize to strings over JSON by default —
// convert to plain numbers the same way platform-fee-config.service.ts does,
// so the frontend can type these as `number`.
function toApi<
  T extends {
    discountValue: { toNumber(): number };
    minSubtotal: { toNumber(): number } | null;
    maxDiscount: { toNumber(): number } | null;
  },
>(promo: T) {
  return {
    ...promo,
    discountValue: promo.discountValue.toNumber(),
    minSubtotal: promo.minSubtotal?.toNumber() ?? null,
    maxDiscount: promo.maxDiscount?.toNumber() ?? null,
  };
}

/**
 * Marks a system-generated voucher — never surfaced to a citizen, never
 * typed by anyone, just the redemption anchor an auto-apply promotion needs
 * so it can reuse the ordinary Voucher/VoucherRedemption limit-checking
 * machinery instead of a second one.
 */
const AUTO_APPLY_CODE_PREFIX = "AUTO";

export default class PromotionSvc {
  /** Idempotent: a promotion already holding an auto-apply voucher keeps it. */
  private static async ensureAutoApplyVoucher(promotionId: string) {
    const existing = await PromotionRepo.findAutoApplyVoucher(promotionId);
    if (existing) return existing;

    let code: string;
    do {
      code = `${AUTO_APPLY_CODE_PREFIX}-${randomCode(10)}`;
    } while (await PromotionRepo.codeExists(code));

    const [voucher] = await PromotionRepo.createVouchers(promotionId, [code]);
    return voucher;
  }

  static async getAll(includeInactive: boolean) {
    const promos = await PromotionRepo.findAll(includeInactive);
    return promos.map(toApi);
  }

  static async getById(id: string) {
    const promo = await PromotionRepo.findById(id);
    if (!promo) throw new Error("Promotion not found");
    return toApi(promo);
  }

  static async create(data: PromotionInput) {
    assertValidPromotion(data);
    const promo = await PromotionRepo.create({
      ...data,
      name: data.name.trim(),
    });
    if (data.autoApply) await this.ensureAutoApplyVoucher(promo.id);
    return toApi(promo);
  }

  static async update(id: string, data: Partial<PromotionInput>) {
    const existing = await PromotionRepo.findById(id);
    if (!existing) throw new Error("Promotion not found");

    // Validate the merged shape — an update sending only `endDate` must
    // still be checked against the existing `startDate`.
    const merged: PromotionInput = {
      name: data.name ?? existing.name,
      discountType: (data.discountType ??
        existing.discountType) as PromotionInput["discountType"],
      discountValue: data.discountValue ?? existing.discountValue.toNumber(),
      startDate:
        data.startDate !== undefined ? data.startDate : existing.startDate,
      endDate: data.endDate !== undefined ? data.endDate : existing.endDate,
    };
    assertValidPromotion(merged);

    const promo = await PromotionRepo.update(id, {
      ...data,
      name: data.name?.trim(),
    });
    if (data.autoApply) await this.ensureAutoApplyVoucher(id);
    return toApi(promo);
  }

  static async remove(id: string) {
    const existing = await PromotionRepo.findById(id);
    if (!existing) throw new Error("Promotion not found");
    return PromotionRepo.softDelete(id);
  }

  /** Generates `count` unique voucher codes for a promotion, optionally with a shared prefix (e.g. "SUMMER-"). */
  static async generateVouchers(
    promotionId: string,
    count: number,
    prefix?: string,
  ) {
    const promo = await PromotionRepo.findById(promotionId);
    if (!promo) throw new Error("Promotion not found");
    if (count < 1 || count > 500) {
      throw new Error("count must be between 1 and 500");
    }

    const cleanPrefix = prefix
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const codes: string[] = [];
    while (codes.length < count) {
      const code = `${cleanPrefix ? cleanPrefix + "-" : ""}${randomCode(6)}`;
      if (codes.includes(code) || (await PromotionRepo.codeExists(code))) {
        continue; // collision — regenerate rather than fail the whole batch
      }
      codes.push(code);
    }

    return PromotionRepo.createVouchers(promotionId, codes);
  }

  static async setVoucherActive(voucherId: string, active: boolean) {
    return PromotionRepo.setVoucherActive(voucherId, active);
  }

  /**
   * Imports pre-chosen codes (e.g. printed on an offline flyer, or handed
   * out by an influencer) instead of generating random ones. Normalizes the
   * same way a citizen's typed entry is normalized (trim + uppercase) so a
   * printed "summer10" and a typed "SUMMER10" are the same code. Duplicates
   * within the batch or against an existing code are skipped, not fatal —
   * the caller gets back exactly which ones were actually created.
   */
  static async importVouchers(promotionId: string, rawCodes: string[]) {
    const promo = await PromotionRepo.findById(promotionId);
    if (!promo) throw new Error("Promotion not found");

    const seen = new Set<string>();
    const toCreate: string[] = [];
    const skipped: string[] = [];
    for (const raw of rawCodes) {
      const code = raw.trim().toUpperCase();
      if (!code) continue;
      if (seen.has(code) || (await PromotionRepo.codeExists(code))) {
        skipped.push(code);
        continue;
      }
      seen.add(code);
      toCreate.push(code);
    }

    const created =
      toCreate.length > 0
        ? await PromotionRepo.createVouchers(promotionId, toCreate)
        : [];
    return { created, skipped };
  }

  static async getAnalytics(promotionId: string) {
    const redemptions = await PromotionRepo.getRedemptionAnalytics(promotionId);
    const totalDiscountGiven = redemptions.reduce(
      (sum, r) => sum + r.discountAmount.toNumber(),
      0,
    );
    return {
      redemptionCount: redemptions.length,
      totalDiscountGiven,
      firstRedeemedAt:
        redemptions.length > 0
          ? redemptions.reduce(
              (min, r) => (r.redeemedAt < min ? r.redeemedAt : min),
              redemptions[0].redeemedAt,
            )
          : null,
      lastRedeemedAt:
        redemptions.length > 0
          ? redemptions.reduce(
              (max, r) => (r.redeemedAt > max ? r.redeemedAt : max),
              redemptions[0].redeemedAt,
            )
          : null,
    };
  }

  // ── Foxer-owned promotions ────────────────────────────────────────────
  // A provider's own voucher, scoped to exactly one listing they own. Its
  // discount is funded out of that provider's own payout (see
  // PayoutSvc.createPayoutsForAssetBooking/ForServiceBooking), never the
  // platform's — unlike an admin promotion (providerId null), which the
  // platform absorbs. Kept as separate `*Own` methods rather than branching
  // the admin ones, so the ownership check can never be skipped by a caller
  // that forgot to pass a providerId.

  /** Verifies the listing exists, belongs to `providerId`, and resolves the transactionType/category it implies. */
  private static async resolveOwnScope(
    providerId: string,
    assetId?: string | null,
    serviceId?: string | null,
    venueId?: string | null,
  ): Promise<{
    assetId: string | null;
    serviceId: string | null;
    venueId: string | null;
    transactionType: string;
    category: string;
  }> {
    const scoped = [assetId, serviceId, venueId].filter(Boolean);
    if (scoped.length !== 1) {
      throw new Error(
        "A promotion must be scoped to exactly one of your own listings (assetId, serviceId or venueId)",
      );
    }

    if (assetId) {
      const asset = await AssetRepo.findAssetById(assetId);
      if (!asset) throw new Error("Asset not found");
      if (asset.ownerId !== providerId) throw new Error("Unauthorized");
      return {
        assetId,
        serviceId: null,
        venueId: null,
        transactionType: "asset",
        category: asset.category,
      };
    }

    if (serviceId) {
      const service = await ServiceRepo.getServiceById(serviceId);
      if (!service || service.deletedAt) throw new Error("Service not found");
      if (service.ownerId !== providerId) throw new Error("Unauthorized");
      return {
        assetId: null,
        serviceId,
        venueId: null,
        transactionType: "service",
        category: service.category,
      };
    }

    const venue = await VenueRepo.findVenueById(venueId!);
    if (!venue) throw new Error("Venue not found");
    if (venue.mayorId !== providerId) throw new Error("Unauthorized");
    return {
      assetId: null,
      serviceId: null,
      venueId: venueId!,
      // Matches both a direct venue booking (see Event.voucherId's schema
      // comment) and this exact venue's own line item inside a
      // multi-provider Event checkout (see PricingSvc.
      // resolveEventLineItemDiscounts) — either way a citizen books this
      // venue, "venue" is the transactionType checked against.
      transactionType: "venue",
      category: venue.category,
    };
  }

  static async getAllForProvider(providerId: string) {
    const promos = await PromotionRepo.findAllForProvider(providerId);
    return promos.map(toApi);
  }

  /** Ownership-guarded fetch — throws rather than returning another provider's promotion. */
  private static async getOwnedById(providerId: string, id: string) {
    const promo = await PromotionRepo.findById(id);
    if (!promo) throw new Error("Promotion not found");
    if (promo.providerId !== providerId) throw new Error("Unauthorized");
    return promo;
  }

  static async createOwn(providerId: string, data: OwnPromotionInput) {
    const scope = await this.resolveOwnScope(
      providerId,
      data.assetId,
      data.serviceId,
      data.venueId,
    );
    assertValidPromotion({ ...data, discountType: data.discountType });

    const promo = await PromotionRepo.create({
      name: data.name.trim(),
      description: data.description,
      transactionType: scope.transactionType,
      category: scope.category,
      providerId,
      assetId: scope.assetId,
      serviceId: scope.serviceId,
      venueId: scope.venueId,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minSubtotal: data.minSubtotal,
      maxDiscount: data.maxDiscount,
      startDate: data.startDate,
      endDate: data.endDate,
      usageLimit: data.usageLimit,
      perUserLimit: data.perUserLimit,
      autoApply: data.autoApply ?? false,
    });
    if (data.autoApply) await this.ensureAutoApplyVoucher(promo.id);
    return toApi(promo);
  }

  static async updateOwn(
    providerId: string,
    id: string,
    data: Partial<OwnPromotionInput>,
  ) {
    const existing = await this.getOwnedById(providerId, id);

    // The listing a voucher is scoped to isn't editable after creation —
    // changing it would silently move an already-issued code's discount
    // onto a different listing (and a different payout). Deactivate and
    // create a new one instead.
    if (
      (data.assetId !== undefined && data.assetId !== existing.assetId) ||
      (data.serviceId !== undefined && data.serviceId !== existing.serviceId) ||
      (data.venueId !== undefined && data.venueId !== existing.venueId)
    ) {
      throw new Error(
        "The listing a promotion is scoped to cannot be changed — deactivate this one and create a new one",
      );
    }

    const merged: PromotionInput = {
      name: data.name ?? existing.name,
      discountType: (data.discountType ??
        existing.discountType) as PromotionInput["discountType"],
      discountValue: data.discountValue ?? existing.discountValue.toNumber(),
      startDate:
        data.startDate !== undefined ? data.startDate : existing.startDate,
      endDate: data.endDate !== undefined ? data.endDate : existing.endDate,
    };
    assertValidPromotion(merged);

    const promo = await PromotionRepo.update(id, {
      name: data.name?.trim(),
      description: data.description,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minSubtotal: data.minSubtotal,
      maxDiscount: data.maxDiscount,
      startDate: data.startDate,
      endDate: data.endDate,
      usageLimit: data.usageLimit,
      perUserLimit: data.perUserLimit,
      autoApply: data.autoApply,
    });
    if (data.autoApply) await this.ensureAutoApplyVoucher(id);
    return toApi(promo);
  }

  static async removeOwn(providerId: string, id: string) {
    await this.getOwnedById(providerId, id);
    return PromotionRepo.softDelete(id);
  }

  static async generateVouchersOwn(
    providerId: string,
    promotionId: string,
    count: number,
    prefix?: string,
  ) {
    await this.getOwnedById(providerId, promotionId);
    return this.generateVouchers(promotionId, count, prefix);
  }

  static async setVoucherActiveOwn(
    providerId: string,
    voucherId: string,
    active: boolean,
  ) {
    const voucher = await PromotionRepo.findVoucherWithPromotion(voucherId);
    if (!voucher) throw new Error("Voucher not found");
    if (voucher.promotion.providerId !== providerId) {
      throw new Error("Unauthorized");
    }
    return PromotionRepo.setVoucherActive(voucherId, active);
  }

  /**
   * Releases a cancelled/refunded booking's voucher usage — call this from
   * every place a booking's status becomes cancelled (or is refunded to
   * $0), so a citizen who never actually kept the discount doesn't
   * permanently lose a slot against `usageLimit`/`perUserLimit`. Safe to
   * call unconditionally (no-op if the booking never had a voucher).
   */
  static async releaseRedemption(match: {
    assetBookingId?: string;
    serviceBookingId?: string;
    eventId?: string;
  }) {
    await PromotionRepo.releaseRedemption(match);
  }

  /** Same idea as `releaseRedemption`, for a multi-provider Event's Invoice
   *  — see `EventCheckoutSvc.cancelEvent`. */
  static async releaseInvoiceRedemptions(invoiceId: string) {
    await PromotionRepo.releaseInvoiceRedemptions(invoiceId);
  }

  static async getAnalyticsOwn(providerId: string, promotionId: string) {
    await this.getOwnedById(providerId, promotionId);
    return this.getAnalytics(promotionId);
  }

  static async importVouchersOwn(
    providerId: string,
    promotionId: string,
    rawCodes: string[],
  ) {
    await this.getOwnedById(providerId, promotionId);
    return this.importVouchers(promotionId, rawCodes);
  }
}
