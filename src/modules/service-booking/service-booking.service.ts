import Stripe from "stripe";
import ServiceBookingRepo from "./service-booking.repository";
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
import { isPerformerServiceCategory } from "../../types/permissions";
import AvailabilitySvc from "../availability/availability.service";
import { sendBookingConfirmationEmail } from "../../utils/emails/confirmation";
import {
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

/** Mirrors `announceBookingChanged` in asset-booking.service.ts. */
function announceBookingChanged(
  bookerId: string | null | undefined,
  ownerId: string | null | undefined,
) {
  announceToUser(bookerId, "bookings");
  if (ownerId && ownerId !== bookerId) announceToUser(ownerId, "bookings");
  announceToAdmins("bookings");
}

export default class ServiceBookingSvc {
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

  static async getAvailability(serviceId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) throw new Error("Service not found");
    const bookedDates = await ServiceBookingRepo.getBookedDates(serviceId);
    return { bookedDates };
  }

  /** Shared by `create` and `previewPrice` — see AssetBookingSvc.priceAssetBooking's comment. */
  private static async priceServiceBooking(
    service: {
      id: string;
      price: { toNumber(): number };
      billingRate: BillingRate;
      ownerId: string;
      category: string;
    },
    startDate: Date,
    endDate: Date,
    userId: string,
    voucherCode?: string,
  ) {
    const itemsTotal = calculateItemsTotal({
      price: service.price.toNumber(),
      quantity: 1,
      startDate,
      endDate,
      billingRate: service.billingRate,
    });

    let discountAmount = 0;
    let voucherId: string | null = null;
    let voucherCodeResolved: string | null = null;
    const voucherContext = {
      transactionType: "service",
      category: service.category,
      userId,
      serviceId: service.id,
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
      service.ownerId,
      "service_lower_fees",
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
    serviceId: string;
    userId: string;
    scheduledDate: string;
    endDate?: string;
    voucherCode?: string;
  }) {
    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
    });
    if (!service || service.deletedAt)
      throw new Error("Service not found or unavailable");

    const scheduledDate = new Date(data.scheduledDate);
    const endDate = data.endDate ? new Date(data.endDate) : scheduledDate;

    return this.priceServiceBooking(
      service,
      scheduledDate,
      endDate,
      data.userId,
      data.voucherCode,
    );
  }

  // NOTE: totalAmount is never accepted from the client — always computed
  // server-side from the service's own price/billingRate. See
  // docs/adr/0001-host-markup-and-server-computed-event-total.md
  static async create(data: {
    serviceId: string;
    userId: string;
    scheduledDate: string;
    endDate?: string;
    guestCount?: number;
    location: string;
    notes?: string;
    voucherCode?: string;
  }) {
    await this.requireVerifiedIdentity(data.userId);

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
    });
    if (!service || service.deletedAt)
      throw new Error("Service not found or unavailable");

    const scheduledDate = new Date(data.scheduledDate);
    const endDate = data.endDate ? new Date(data.endDate) : scheduledDate;

    const pricing = await this.priceServiceBooking(
      service,
      scheduledDate,
      endDate,
      data.userId,
      data.voucherCode,
    );

    const booking = await prisma.$transaction(async (tx) => {
      await AvailabilitySvc.reserve(tx, [
        {
          kind: "service",
          itemId: data.serviceId,
          dateRange: { start: scheduledDate, end: endDate },
        },
      ]);

      return ServiceBookingRepo.create(
        {
          serviceId: data.serviceId,
          userId: data.userId,
          scheduledDate,
          endDate: data.endDate ? endDate : undefined,
          guestCount: data.guestCount,
          location: data.location,
          notes: data.notes,
          totalAmount: pricing.totalAmount,
          platformFeeAmount: pricing.platformFeeAmount,
          discountAmount: pricing.discountAmount,
          voucherId: pricing.voucherId,
        },
        tx,
      );
    });

    announceBookingChanged(data.userId, service.ownerId);
    return booking;
  }

  static async getAll(filters?: {
    userId?: string;
    ownerId?: string;
    status?: string;
  }) {
    return ServiceBookingRepo.findAll({
      userId: filters?.userId,
      ownerId: filters?.ownerId,
      status: filters?.status as ItemBookingStatus | undefined,
    });
  }

  static async getById(id: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    return booking;
  }

  static async confirmPayment(
    id: string,
    transactionId: string,
    method: string,
    requesterId: string,
  ) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === ItemBookingStatus.cancelled)
      throw new Error("Booking is cancelled");

    const confirmed = await ServiceBookingRepo.confirmPayment(
      id,
      transactionId,
      method,
    );

    await prisma.payment.upsert({
      where: { providerReference: transactionId },
      create: {
        serviceBookingId: id,
        amount: booking.totalAmount,
        method,
        providerReference: transactionId,
        status: "paid",
        paidAt: new Date(),
      },
      update: {
        serviceBookingId: id,
        amount: booking.totalAmount,
        method,
        status: "paid",
        paidAt: new Date(),
      },
    });

    if (booking.voucherId && booking.discountAmount.toNumber() > 0) {
      await prisma.voucherRedemption
        .create({
          data: {
            voucherId: booking.voucherId,
            userId: booking.userId,
            serviceBookingId: id,
            discountAmount: booking.discountAmount,
          },
        })
        .catch((e) =>
          console.error(`Failed to record voucher redemption for ${id}`, e),
        );
    }

    announceBookingChanged(booking.userId, booking.service?.ownerId);

    // Fire-and-forget, mirroring BookingSvc.confirmBookingPayment — a failed
    // send must never fail a payment confirmation that already succeeded.
    const userEmail = booking.user?.email;
    if (userEmail) {
      sendBookingConfirmationEmail({
        to: userEmail,
        eventName: booking.service?.name ?? "Your Service Booking",
        bookingId: id,
        startDate: booking.scheduledDate.toISOString(),
        totalPaid: formatCurrency(booking.totalAmount.toNumber()),
      }).catch((e) =>
        console.error(`Failed to send confirmation email for ${id}`, e),
      );
    }

    return confirmed;
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");

    const isOwner = booking.service?.owner?.id === requesterId;
    const isBooker = booking.userId === requesterId;
    if (!isOwner && !isBooker) throw new Error("Unauthorized");

    const updated = await ServiceBookingRepo.updateStatus(
      id,
      status as ItemBookingStatus,
    );

    if (status === ItemBookingStatus.cancelled) {
      PromotionSvc.releaseRedemption({ serviceBookingId: id }).catch((e) =>
        console.error(`Failed to release voucher redemption for ${id}`, e),
      );
    }

    if (status === ItemBookingStatus.completed) {
      try {
        await PayoutSvc.createPayoutsForServiceBooking(id);
      } catch (err) {
        console.error(`Payout failed for service booking ${id}`, err);
      }
      const isPerformerListing = booking.service?.category
        ? isPerformerServiceCategory(booking.service.category)
        : false;
      import("../passport/passport.service")
        .then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          const ownerId =
            booking.service?.ownerId ?? booking.service?.owner?.id;
          if (ownerId)
            return PassportSvc.awardXP(
              ownerId,
              isPerformerListing
                ? UserPath.performerFoxer
                : UserPath.serviceFoxer,
              XP_REWARDS.listingBooked,
            );
        })
        .catch(() => {});
      import("../users/specialization.service")
        .then(({ default: SpecializationSvc }) => {
          const serviceId = booking.service?.id ?? booking.serviceId;
          const ownerId =
            booking.service?.ownerId ?? booking.service?.owner?.id;
          if (serviceId && ownerId)
            return isPerformerListing
              ? SpecializationSvc.checkPerformerFoxer(serviceId, ownerId)
              : SpecializationSvc.checkServiceFoxer(serviceId, ownerId);
        })
        .catch(() => {});
    }

    announceBookingChanged(booking.userId, booking.service?.ownerId);
    return updated;
  }

  /**
   * The citizen cancels their own booking — see AssetBookingSvc.
   * cancelWithRefund's comment for the full rationale; this mirrors it
   * exactly, keyed off `scheduledDate` instead of `startDate`.
   */
  static async cancelWithRefund(id: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId) {
      throw new Error("Only the person who booked this can cancel it");
    }
    if (["completed", "cancelled", "disputed"].includes(booking.status)) {
      throw new Error("Booking cannot be cancelled at this stage");
    }

    const { refundPercent, matchedRule } = RefundSvc.computeRefund(
      booking.scheduledDate,
      booking.service?.cancellationPolicy ?? null,
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
            serviceBookingId: id,
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
              serviceBookingId: id,
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
              serviceBookingId: id,
              amount: estimatedRefund,
              providerReference: null,
              status: RefundStatus.failed,
              reason: `Refund attempt failed: ${err.message}`,
            },
          });
        }
      }
    }

    const cancelled = await ServiceBookingRepo.cancel(id);
    PromotionSvc.releaseRedemption({ serviceBookingId: id }).catch((e) =>
      console.error(`Failed to release voucher redemption for ${id}`, e),
    );
    announceBookingChanged(booking.userId, booking.service?.ownerId);

    if (refund && refund.status !== RefundStatus.failed) {
      NotificationService.create({
        userId: booking.userId,
        type: "booking_cancelled",
        title: "Booking cancelled",
        message:
          refund.amount.toNumber() > 0
            ? `${booking.service?.name ?? "Your booking"} was cancelled. A refund of ${refund.amount.toString()} is on its way.`
            : `${booking.service?.name ?? "Your booking"} was cancelled. No refund applies under the cancellation policy.`,
        metadata: { link: `/booking/fulfillment/service/${id}` },
      }).catch((e) =>
        console.error("Failed to create cancellation notification", e),
      );
    }

    return { booking: cancelled, refund };
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status))
      throw new Error("Booking cannot be confirmed at this stage");
    const confirmed = await ServiceBookingRepo.confirmArrival(id);
    announceBookingChanged(booking.userId, booking.service?.ownerId);
    return confirmed;
  }

  static async dispute(id: string, requesterId: string, reason?: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status))
      throw new Error("Booking cannot be disputed at this stage");
    const disputed = await ServiceBookingRepo.dispute(id, reason);
    announceBookingChanged(booking.userId, booking.service?.ownerId);
    // This is the only way a row reaches /admin/service-bookings/disputes.
    announceToAdmins("disputes");
    return disputed;
  }

  /** Mirrors AssetBookingSvc.providerCancel exactly — see its comment. */
  static async providerCancel(id: string, providerId: string, reason: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.service?.ownerId !== providerId)
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
            serviceBookingId: id,
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
            serviceBookingId: id,
            amount: booking.totalAmount,
            providerReference: null,
            status: RefundStatus.failed,
            reason: `Provider cancelled: ${reason}`,
          },
        });
      }
    }

    const cancelled = await ServiceBookingRepo.providerCancel(id, reason);
    PromotionSvc.releaseRedemption({ serviceBookingId: id }).catch((e) =>
      console.error(`Failed to release voucher redemption for ${id}`, e),
    );
    announceBookingChanged(booking.userId, booking.service?.ownerId);
    announceToAdmins("bookings");

    NotificationService.create({
      userId: booking.userId,
      type: "booking_cancelled_by_provider",
      title: "Your booking was cancelled by the provider",
      message: `${booking.service?.name ?? "Your booking"} was cancelled by the provider: ${reason}. You've been refunded in full.`,
      metadata: { link: `/booking/fulfillment/service/${id}` },
    }).catch((e) =>
      console.error("Failed to create cancellation notification", e),
    );

    return cancelled;
  }
}
