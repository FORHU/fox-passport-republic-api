import Stripe from "stripe";
import AssetBookingRepo from "./asset-booking.repository";
import { prisma } from "../../utils/prisma";
import { BillingRate, ItemBookingStatus, RefundStatus } from "@prisma/client";
import {
  calculateItemsTotal,
  formatCurrency,
  toStripeCents,
} from "../../utils/pricing";
import { PLATFORM_FEE_PERCENT, STRIPE_SECRET_KEY } from "../../config";
import PayoutSvc from "../payout/payout.service";
import NotificationService from "../notifications/user-notification.service";
import PricingSvc from "../pricing/pricing.service";
import PromotionSvc from "../promotion/promotion.service";
import RefundSvc from "../refund/refund.service";
import AvailabilitySvc from "../availability/availability.service";
import { sendBookingConfirmationEmail } from "../../utils/emails/confirmation";
import {
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

/**
 * Both sides of an asset booking are looking at it: the person who booked, and
 * the owner whose gear it is. Announcing from the service rather than the
 * controller covers every caller - `cancel` reaches `updateStatus` without
 * passing through a controller of its own - and costs nothing, because every
 * handler here has already loaded the booking and its asset to authorise the
 * request.
 */
function announceBookingChanged(
  bookerId: string | null | undefined,
  ownerId: string | null | undefined,
) {
  announceToUser(bookerId, "bookings");
  if (ownerId && ownerId !== bookerId) announceToUser(ownerId, "bookings");
  // The admin Bookings tab lists all three booking kinds. `bookings` rather
  // than `admin:pending`: both invalidate ["admin-data"], but only one of them
  // says what actually happened.
  announceToAdmins("bookings");
}

export default class AssetBookingSvc {
  private static async requireVerifiedIdentity(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isEmailVerified: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.isEmailVerified !== true) {
      throw new Error("Identity verification required before booking");
    }
  }

  static async getAvailability(assetId: string) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new Error("Asset not found");
    return AssetBookingRepo.getBookedRanges(assetId);
  }

  /**
   * Shared by `create` and `previewPrice` so the checkout screen's live
   * total (before the booking exists) can never drift from what actually
   * gets charged. Voucher discount applies to the pre-fee subtotal, same
   * order as `PricingSvc.calculatePrice` uses for the Central Payment flow —
   * this doesn't call that function directly since the platform-fee model
   * here (`PLATFORM_FEE_PERCENT` + the `lower_fees` perk) is a separate,
   * older system from `PlatformFeeConfig`/`resolvePricingRule`.
   */
  private static async priceAssetBooking(
    asset: {
      id: string;
      price: { toNumber(): number };
      billingRate: BillingRate;
      ownerId: string;
      category: string;
    },
    quantity: number,
    startDate: Date,
    endDate: Date,
    userId: string,
    voucherCode?: string,
  ) {
    const itemsTotal = calculateItemsTotal({
      price: asset.price.toNumber(),
      quantity,
      startDate,
      endDate,
      billingRate: asset.billingRate,
    });

    let discountAmount = 0;
    let voucherId: string | null = null;
    let voucherCodeResolved: string | null = null;
    const voucherContext = {
      transactionType: "asset",
      category: asset.category,
      userId,
      assetId: asset.id,
    };
    if (voucherCode) {
      const validated = await PricingSvc.validateAndCalculateVoucher(
        voucherCode,
        itemsTotal,
        voucherContext,
      );
      discountAmount = validated.discountAmount;
      voucherId = validated.voucher.id;
      voucherCodeResolved = validated.voucher.code;
    } else {
      const auto = await PricingSvc.findAutoApplyDiscount(
        itemsTotal,
        voucherContext,
      );
      if (auto) {
        discountAmount = auto.discountAmount;
        voucherId = auto.voucher.id;
        voucherCodeResolved = auto.voucher.code;
      }
    }
    const discountedItemsTotal = itemsTotal - discountAmount;

    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const ownerHasLowerFees = await PassportSvc.hasPerk(
      asset.ownerId,
      "lower_fees",
    );
    const effectiveFeePercent = ownerHasLowerFees ? 0 : PLATFORM_FEE_PERCENT;
    const platformFeeAmount =
      discountedItemsTotal * (effectiveFeePercent / 100);
    const totalAmount = discountedItemsTotal + platformFeeAmount;

    return {
      itemsTotal,
      discountAmount,
      voucherId,
      voucherCode: voucherCodeResolved,
      platformFeeAmount,
      totalAmount,
    };
  }

  /** Live price preview for the checkout screen — computes but never persists. */
  static async previewPrice(data: {
    assetId: string;
    userId: string;
    startDate: string;
    endDate: string;
    quantity: number;
    voucherCode?: string;
  }) {
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });
    if (!asset || asset.deletedAt)
      throw new Error("Asset not found or unavailable");
    if (data.quantity > asset.quantity) {
      throw new Error(`Only ${asset.quantity} unit(s) available`);
    }

    return this.priceAssetBooking(
      asset,
      data.quantity,
      new Date(data.startDate),
      new Date(data.endDate),
      data.userId,
      data.voucherCode,
    );
  }

  // NOTE: totalAmount is never accepted from the client — always computed
  // server-side from the asset's own price/billingRate. See
  // docs/adr/0001-host-markup-and-server-computed-event-total.md
  static async create(data: {
    assetId: string;
    userId: string;
    startDate: string;
    endDate: string;
    quantity: number;
    fulfillmentType: string;
    deliveryAddress?: string;
    notes?: string;
    voucherCode?: string;
  }) {
    await this.requireVerifiedIdentity(data.userId);

    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });
    if (!asset || asset.deletedAt)
      throw new Error("Asset not found or unavailable");

    if (data.quantity > asset.quantity) {
      throw new Error(`Only ${asset.quantity} unit(s) available`);
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    const pricing = await this.priceAssetBooking(
      asset,
      data.quantity,
      startDate,
      endDate,
      data.userId,
      data.voucherCode,
    );

    // The lock-then-check-then-insert sequence must be one transaction: see
    // AvailabilitySvc's doc comment. The quantity>asset.quantity check above
    // is only a fast, non-authoritative pre-check (an obviously-invalid
    // request); this is the real, concurrency-safe availability guarantee.
    const booking = await prisma.$transaction(async (tx) => {
      await AvailabilitySvc.reserve(tx, [
        {
          kind: "asset",
          itemId: data.assetId,
          dateRange: { start: startDate, end: endDate },
          quantity: data.quantity,
        },
      ]);

      return AssetBookingRepo.create(
        {
          assetId: data.assetId,
          userId: data.userId,
          startDate,
          endDate,
          quantity: data.quantity,
          fulfillmentType: data.fulfillmentType,
          deliveryAddress: data.deliveryAddress,
          notes: data.notes,
          totalAmount: pricing.totalAmount,
          platformFeeAmount: pricing.platformFeeAmount,
          discountAmount: pricing.discountAmount,
          voucherId: pricing.voucherId,
        },
        tx,
      );
    });

    announceBookingChanged(data.userId, asset.ownerId);
    return booking;
  }

  static async getAll(filters?: {
    userId?: string;
    ownerId?: string;
    status?: string;
  }) {
    return AssetBookingRepo.findAll({
      userId: filters?.userId,
      ownerId: filters?.ownerId,
      status: filters?.status as ItemBookingStatus | undefined,
    });
  }

  static async getById(id: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    return booking;
  }

  static async confirmPayment(
    id: string,
    transactionId: string,
    method: string,
    requesterId: string,
  ) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === ItemBookingStatus.cancelled)
      throw new Error("Booking is cancelled");

    const confirmed = await AssetBookingRepo.confirmPayment(
      id,
      transactionId,
      method,
    );

    await prisma.payment.upsert({
      where: { providerReference: transactionId },
      create: {
        assetBookingId: id,
        amount: booking.totalAmount,
        method,
        providerReference: transactionId,
        status: "paid",
        paidAt: new Date(),
      },
      update: {
        assetBookingId: id,
        amount: booking.totalAmount,
        method,
        status: "paid",
        paidAt: new Date(),
      },
    });

    // Redemption is only counted once payment actually confirms — mirrors
    // webhook.service.ts's paid-invoice redemption, so an abandoned checkout
    // never counts against the voucher's usage limits.
    if (booking.voucherId && booking.discountAmount.toNumber() > 0) {
      await prisma.voucherRedemption
        .create({
          data: {
            voucherId: booking.voucherId,
            userId: booking.userId,
            assetBookingId: id,
            discountAmount: booking.discountAmount,
          },
        })
        .catch((e) =>
          console.error(`Failed to record voucher redemption for ${id}`, e),
        );
    }

    announceBookingChanged(booking.userId, booking.asset?.ownerId);

    // Fire-and-forget, mirroring BookingSvc.confirmBookingPayment — a failed
    // send must never fail a payment confirmation that already succeeded.
    const userEmail = booking.user?.email;
    if (userEmail) {
      sendBookingConfirmationEmail({
        to: userEmail,
        eventName: `${booking.asset?.name ?? "Equipment"} Rental`,
        bookingId: id,
        startDate: booking.startDate.toISOString(),
        totalPaid: formatCurrency(booking.totalAmount.toNumber()),
      }).catch((e) =>
        console.error(`Failed to send confirmation email for ${id}`, e),
      );
    }

    return confirmed;
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");

    const isOwner = booking.asset?.owner?.id === requesterId;
    const isBooker = booking.userId === requesterId;
    if (!isOwner && !isBooker) throw new Error("Unauthorized");

    const updated = await AssetBookingRepo.updateStatus(
      id,
      status as ItemBookingStatus,
    );

    if (status === ItemBookingStatus.cancelled) {
      // Release the voucher slot — the citizen never actually kept the
      // discount, so it shouldn't permanently count against their limit.
      PromotionSvc.releaseRedemption({ assetBookingId: id }).catch((e) =>
        console.error(`Failed to release voucher redemption for ${id}`, e),
      );
    }

    if (status === ItemBookingStatus.completed) {
      try {
        await PayoutSvc.createPayoutsForAssetBooking(id);
      } catch (err) {
        console.error(`Payout failed for asset booking ${id}`, err);
      }
      import("../passport/passport.service")
        .then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          const ownerId = booking.asset?.ownerId ?? booking.asset?.owner?.id;
          if (ownerId)
            return PassportSvc.awardXP(
              ownerId,
              UserPath.gearFoxer,
              XP_REWARDS.listingBooked,
            );
        })
        .catch(() => {});
      import("../users/specialization.service")
        .then(({ default: SpecializationSvc }) => {
          const assetId = booking.asset?.id ?? booking.assetId;
          const ownerId = booking.asset?.ownerId ?? booking.asset?.owner?.id;
          if (assetId && ownerId)
            return SpecializationSvc.checkGearFoxer(assetId, ownerId);
        })
        .catch(() => {});
    }

    announceBookingChanged(booking.userId, booking.asset?.ownerId);
    return updated;
  }

  /**
   * The citizen cancels their own booking — unlike `providerCancel` below
   * (always 100%, since the provider caused it), the refund is prorated by
   * the asset's own cancellation policy against how far out the booking's
   * `startDate` is, same as `cancelWithRefunds` does for the venue/event
   * Booking flow. Previously this was `updateStatus(cancelled)` with no
   * refund at all — money was just kept with no `Refund` row, no audit
   * trail, nothing.
   */
  static async cancelWithRefund(id: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId) {
      throw new Error("Only the person who booked this can cancel it");
    }
    if (["completed", "cancelled", "disputed"].includes(booking.status)) {
      throw new Error("Booking cannot be cancelled at this stage");
    }

    const { refundPercent, matchedRule } = RefundSvc.computeRefund(
      booking.startDate,
      booking.asset?.cancellationPolicy ?? null,
    );

    let refund = null;
    if (
      booking.paymentStatus === "paid" &&
      booking.paymentTransactionId?.startsWith("pi_")
    ) {
      const estimatedRefund = booking.totalAmount.mul(refundPercent).div(100);

      if (refundPercent <= 0) {
        refund = await prisma.refund.create({
          data: {
            assetBookingId: id,
            amount: 0,
            providerReference: null,
            status: RefundStatus.succeeded,
            reason: matchedRule
              ? `${matchedRule.hoursBeforeEvent}h before = ${matchedRule.refundPercent}% refund`
              : "No cancellation policy matched — 0% refund",
          },
        });
      } else {
        try {
          const sr = await stripe.refunds.create({
            payment_intent: booking.paymentTransactionId,
            amount: toStripeCents(estimatedRefund.toNumber()),
          });
          refund = await prisma.refund.create({
            data: {
              assetBookingId: id,
              amount: estimatedRefund,
              providerReference: sr.id,
              status:
                sr.status === "succeeded"
                  ? RefundStatus.succeeded
                  : sr.status === "failed"
                    ? RefundStatus.failed
                    : RefundStatus.pending,
              reason: matchedRule
                ? `${matchedRule.hoursBeforeEvent}h before = ${matchedRule.refundPercent}% refund`
                : "No cancellation policy matched — 0% refund",
            },
          });
        } catch (e: unknown) {
          const err = e as Error;
          console.error(`Citizen-cancel refund failed for ${id}`, err);
          refund = await prisma.refund.create({
            data: {
              assetBookingId: id,
              amount: estimatedRefund,
              providerReference: null,
              status: RefundStatus.failed,
              reason: `Refund attempt failed: ${err.message}`,
            },
          });
        }
      }
    }

    const cancelled = await AssetBookingRepo.cancel(id);
    PromotionSvc.releaseRedemption({ assetBookingId: id }).catch((e) =>
      console.error(`Failed to release voucher redemption for ${id}`, e),
    );
    announceBookingChanged(booking.userId, booking.asset?.ownerId);

    if (refund && refund.status !== RefundStatus.failed) {
      NotificationService.create({
        userId: booking.userId,
        type: "booking_cancelled",
        title: "Booking cancelled",
        message:
          refund.amount.toNumber() > 0
            ? `${booking.asset?.name ?? "Your booking"} was cancelled. A refund of ${refund.amount.toString()} is on its way.`
            : `${booking.asset?.name ?? "Your booking"} was cancelled. No refund applies under the cancellation policy.`,
        metadata: { link: `/booking/fulfillment/asset/${id}` },
      }).catch((e) =>
        console.error("Failed to create cancellation notification", e),
      );
    }

    return { booking: cancelled, refund };
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status))
      throw new Error("Booking cannot be confirmed at this stage");
    const confirmed = await AssetBookingRepo.confirmArrival(id);
    announceBookingChanged(booking.userId, booking.asset?.ownerId);
    return confirmed;
  }

  static async dispute(id: string, requesterId: string, reason?: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status))
      throw new Error("Booking cannot be disputed at this stage");
    const disputed = await AssetBookingRepo.dispute(id, reason);
    announceBookingChanged(booking.userId, booking.asset?.ownerId);
    // This is the only way a row reaches /admin/asset-bookings/disputes.
    announceToAdmins("disputes");
    return disputed;
  }

  /**
   * The owner cancels because they can't deliver (gear broke, double-booked,
   * etc.) — unlike `cancel()` above (either party, no refund logic at all
   * today), this always refunds 100% of whatever was paid. No cancellation-
   * policy tiers apply: the citizen didn't cause this, so they don't eat a
   * cancellation fee the way a citizen-initiated cancellation would on the
   * venue/event Booking flow (see booking.service.ts's cancelWithRefunds).
   */
  static async providerCancel(id: string, providerId: string, reason: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.asset?.ownerId !== providerId)
      throw new Error("Only the owner can cancel this booking");
    if (["completed", "cancelled", "disputed"].includes(booking.status))
      throw new Error("Booking cannot be cancelled at this stage");

    if (
      booking.paymentStatus === "paid" &&
      booking.paymentTransactionId?.startsWith("pi_")
    ) {
      try {
        const sr = await stripe.refunds.create({
          payment_intent: booking.paymentTransactionId,
          amount: toStripeCents(booking.totalAmount.toNumber()),
        });
        await prisma.refund.create({
          data: {
            assetBookingId: id,
            amount: booking.totalAmount,
            providerReference: sr.id,
            status:
              sr.status === "succeeded"
                ? RefundStatus.succeeded
                : RefundStatus.pending,
            reason: `Provider cancelled: ${reason}`,
          },
        });
      } catch (e: unknown) {
        const err = e as Error;
        console.error(`Provider-cancel refund failed for ${id}`, err);
        await prisma.refund.create({
          data: {
            assetBookingId: id,
            amount: booking.totalAmount,
            providerReference: null,
            status: RefundStatus.failed,
            reason: `Provider cancelled: ${reason}`,
          },
        });
      }
    }

    const cancelled = await AssetBookingRepo.providerCancel(id, reason);
    PromotionSvc.releaseRedemption({ assetBookingId: id }).catch((e) =>
      console.error(`Failed to release voucher redemption for ${id}`, e),
    );
    announceBookingChanged(booking.userId, booking.asset?.ownerId);
    announceToAdmins("bookings");

    NotificationService.create({
      userId: booking.userId,
      type: "booking_cancelled_by_provider",
      title: "Your booking was cancelled by the provider",
      message: `${booking.asset?.name ?? "Your booking"} was cancelled by the owner: ${reason}. You've been refunded in full.`,
      metadata: { link: `/booking/fulfillment/asset/${id}` },
    }).catch((e) =>
      console.error("Failed to create cancellation notification", e),
    );

    return cancelled;
  }
}
