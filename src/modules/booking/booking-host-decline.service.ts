import Stripe from "stripe";
import { AppError, notFound } from "../../utils/errors";
import { prisma } from "../../utils/prisma";
import { bookingLink } from "../../utils/notification-links";
import { STRIPE_SECRET_KEY } from "../../config";
import BookingRepo from "./booking.repository";
import PaymentRepo from "../payment/payment.repository";
import EventRequestSvc from "../event-request/event-request.service";
import PromotionSvc from "../promotion/promotion.service";
import NotificationService from "../notifications/user-notification.service";
import { recordChangeBy } from "../audit/audit.service";
import { RESERVING_TRANSACTION_STATUSES } from "../availability/availability.types";
import { DeclineAfterPaymentError } from "../transaction-status/transaction-status.types";

/** Why the host cannot run the event. A fixed set, never free text. */
export type HostDeclineCause = "busy" | "other";

/**
 * The Event Foxer (the event's host) leaves a booking they cannot attend, for
 * example because they are booked on another event at the same time (ADR
 * 0011). Allowed only while the booking is unpaid: nothing has been charged,
 * so nothing is refunded. After payment the host leaves only through the
 * cancellation and refund policy.
 *
 * It ends the booking, frees every Supplier it had reserved, and tells the
 * citizen and each Supplier.
 */
export default class BookingHostDeclineSvc {
  static async decline(
    bookingId: string,
    hostId: string,
    cause: HostDeclineCause = "other",
  ) {
    const booking = await BookingRepo.findById(bookingId);
    if (!booking) throw notFound("Booking");
    if (booking.event?.organizerId !== hostId) {
      throw new AppError("Only the event's host can decline it", 403);
    }
    if (booking.status === "cancelled") {
      throw new AppError("Booking is already cancelled", 409);
    }
    // `pending` is an unpaid booking; anything else is past that.
    if (booking.status !== "pending") throw new DeclineAfterPaymentError();

    await this.cancelPendingPayments(bookingId);

    // The Suppliers' slots follow their rows' status, not the booking's, so
    // each live row is moved to cancelled or the calendars stay held.
    const live = {
      bookingId,
      status: { in: [...RESERVING_TRANSACTION_STATUSES] },
    };
    const [assets, services, venues] = await Promise.all([
      prisma.eventAssetTransaction.findMany({
        where: live,
        select: { providerId: true },
      }),
      prisma.eventServiceTransaction.findMany({
        where: live,
        select: { providerId: true },
      }),
      prisma.eventVenueTransaction.findMany({
        where: live,
        select: { providerId: true },
      }),
    ]);
    await prisma.$transaction([
      prisma.eventAssetTransaction.updateMany({
        where: live,
        data: { status: "cancelled" },
      }),
      prisma.eventServiceTransaction.updateMany({
        where: live,
        data: { status: "cancelled" },
      }),
      prisma.eventVenueTransaction.updateMany({
        where: live,
        data: { status: "cancelled" },
      }),
    ]);

    const updated = await BookingRepo.cancel(bookingId);
    await EventRequestSvc.syncStatusFromBookings(booking.eventId);

    // Best effort from here: the decline has committed.
    PromotionSvc.releaseRedemption({ eventId: booking.eventId }).catch((e) =>
      console.error(`Voucher release failed for event ${booking.eventId}`, e),
    );
    if (booking.event?.templateId) {
      await recordChangeBy(
        hostId,
        "booking.host_declined",
        booking.event.templateId,
        { bookingId, cause },
      ).catch((e) => console.error("Host decline record failed", e));
    }
    await this.notify(
      booking,
      cause,
      [...assets, ...services, ...venues].map((r) => r.providerId),
    ).catch((e) =>
      console.error(`Host decline notifications failed for ${bookingId}`, e),
    );

    return updated;
  }

  /** An unpaid booking may hold an open payment intent; release it. */
  private static async cancelPendingPayments(bookingId: string) {
    const payments = await PaymentRepo.getBookingPayments(bookingId);
    const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-08-27.basil",
    });
    for (const payment of payments.filter((p) => p.status === "pending")) {
      if (payment.providerReference?.startsWith("pi_")) {
        try {
          await stripe.paymentIntents.cancel(payment.providerReference);
        } catch {
          // Already settled or gone on Stripe's side; the row is cancelled below.
        }
      }
      await BookingRepo.markPaymentCancelled(payment.id);
    }
  }

  private static async notify(
    booking: {
      id: string;
      userId: string;
      event: { name: string; organizerId: string } | null;
    },
    cause: HostDeclineCause,
    providerIds: string[],
  ) {
    const eventName = booking.event?.name ?? "your event";
    const why =
      cause === "busy" ? " (the host is busy with another event)" : "";

    await NotificationService.create({
      userId: booking.userId,
      type: "BOOKING_HOST_DECLINED",
      title: "The host can't run your event",
      message: `The host declined ${eventName}${why}. Nothing was charged.`,
      metadata: { link: bookingLink(booking.id), bookingId: booking.id },
    });

    const suppliers = new Set(providerIds);
    suppliers.delete(booking.userId);
    for (const providerId of suppliers) {
      await NotificationService.create({
        userId: providerId,
        type: "BOOKING_HOST_DECLINED",
        title: "An event you were booked for is off",
        message: `${eventName} was declined by its host, so your booking was released.`,
        metadata: { bookingId: booking.id },
      }).catch((e) =>
        console.error(`Supplier ${providerId} was not told of the decline`, e),
      );
    }
  }
}
