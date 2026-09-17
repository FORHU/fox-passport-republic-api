import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import { BookingEditRequestStatus, Prisma, RefundStatus } from "@prisma/client";
import BookingEditRequestRepo from "./booking-edit-request.repository";
import AssetBookingRepo from "../asset-booking/asset-booking.repository";
import ServiceBookingRepo from "../service-booking/service-booking.repository";
import { calculateItemsTotal, toStripeCents } from "../../utils/pricing";
import { PLATFORM_FEE_PERCENT, STRIPE_SECRET_KEY } from "../../config";
import NotificationService from "../notifications/user-notification.service";
import {
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

const EXPIRY_HOURS = 48;
const ACTIVE_STATUSES = ["pending", "confirmed", "active"];

type BookingKind = "asset" | "service";

interface CreateInput {
  bookingKind: BookingKind;
  bookingId: string;
  requestedById: string;
  proposedQuantity?: number;
  proposedGuestCount?: number;
  proposedStartDate?: string;
  proposedEndDate?: string;
  reason?: string;
}

export default class BookingEditRequestSvc {
  // Re-runs the exact same pricing formula AssetBookingSvc.create/
  // ServiceBookingSvc.create use, against the proposed quantity/dates, so the
  // repriced total is never trusted from the client and never drifts from how
  // the original booking was priced. Guest count on a ServiceBooking is
  // capacity only — quantity is always 1 there, per ServiceBookingSvc.create.
  private static async reprice(
    bookingKind: BookingKind,
    listingId: string,
    ownerId: string,
    quantity: number,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const { default: PassportSvc } = await import(
      "../passport/passport.service"
    );

    if (bookingKind === "asset") {
      const asset = await prisma.asset.findUnique({
        where: { id: listingId },
      });
      if (!asset) throw new Error("Asset not found");
      const itemsTotal = calculateItemsTotal({
        price: asset.price.toNumber(),
        quantity,
        startDate,
        endDate,
        billingRate: asset.billingRate,
      });
      const hasLowerFees = await PassportSvc.hasPerk(ownerId, "lower_fees");
      const feePercent = hasLowerFees ? 0 : PLATFORM_FEE_PERCENT;
      return itemsTotal + itemsTotal * (feePercent / 100);
    }

    const service = await prisma.service.findUnique({
      where: { id: listingId },
    });
    if (!service) throw new Error("Service not found");
    const itemsTotal = calculateItemsTotal({
      price: service.price.toNumber(),
      quantity: 1,
      startDate,
      endDate,
      billingRate: service.billingRate,
    });
    const hasLowerFees = await PassportSvc.hasPerk(
      ownerId,
      "service_lower_fees",
    );
    const feePercent = hasLowerFees ? 0 : PLATFORM_FEE_PERCENT;
    return itemsTotal + itemsTotal * (feePercent / 100);
  }

  // Queries other bookings directly (excluding this one by id) rather than
  // reusing AssetBookingRepo.getBookedRanges/ServiceBookingRepo.getBookedDates
  // — both of those include this booking's own current row with no way to
  // exclude it, which would make a booking conflict with its own dates.
  private static async assertAvailable(
    bookingKind: BookingKind,
    listingId: string,
    excludeBookingId: string,
    quantity: number,
    startDate: Date,
    endDate: Date,
  ) {
    if (bookingKind === "asset") {
      const [asset, others] = await Promise.all([
        prisma.asset.findUnique({
          where: { id: listingId },
          select: { quantity: true },
        }),
        prisma.assetBooking.findMany({
          where: {
            assetId: listingId,
            id: { not: excludeBookingId },
            status: { notIn: ["cancelled", "disputed"] },
            startDate: { lt: endDate },
            endDate: { gt: startDate },
          },
          select: { quantity: true },
        }),
      ]);
      const bookedQty = others.reduce((sum, b) => sum + b.quantity, 0);
      if (bookedQty + quantity > (asset?.quantity ?? 0)) {
        throw new Error(
          "Not enough availability for the proposed dates/quantity",
        );
      }
      return;
    }

    const proposedDate = startDate.toISOString().split("T")[0];
    const conflict = await prisma.serviceBooking.findFirst({
      where: {
        serviceId: listingId,
        id: { not: excludeBookingId },
        status: { notIn: ["cancelled", "disputed"] },
        scheduledDate: {
          gte: new Date(`${proposedDate}T00:00:00.000Z`),
          lt: new Date(`${proposedDate}T23:59:59.999Z`),
        },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new Error("The provider already has another booking on that date");
    }
  }

  static async create(input: CreateInput) {
    const {
      bookingKind,
      bookingId,
      requestedById,
      proposedQuantity,
      proposedGuestCount,
      proposedStartDate,
      proposedEndDate,
      reason,
    } = input;

    const existing = await BookingEditRequestRepo.findLatestForBooking(
      bookingKind,
      bookingId,
    );
    if (existing && existing.status === BookingEditRequestStatus.pending) {
      // Expiry is only materialized lazily (on read via getForBooking, or on
      // approve) — a pending row past its expiresAt that nobody has fetched
      // yet would otherwise block a new request forever.
      if (this.expireIfPast(existing)) {
        await BookingEditRequestRepo.updateStatus(
          existing.id,
          BookingEditRequestStatus.expired,
        );
      } else {
        throw new Error(
          "There's already a pending edit request on this booking",
        );
      }
    }

    if (bookingKind === "asset") {
      const booking = await AssetBookingRepo.findById(bookingId);
      if (!booking) throw new Error("Asset booking not found");
      if (booking.userId !== requestedById) throw new Error("Unauthorized");
      if (!ACTIVE_STATUSES.includes(booking.status))
        throw new Error("This booking can no longer be edited");

      const quantity = proposedQuantity ?? booking.quantity;
      const startDate = proposedStartDate
        ? new Date(proposedStartDate)
        : booking.startDate;
      const endDate = proposedEndDate
        ? new Date(proposedEndDate)
        : booking.endDate;
      if (quantity > booking.asset.quantity)
        throw new Error(`Only ${booking.asset.quantity} unit(s) available`);

      if (proposedStartDate || proposedEndDate || proposedQuantity) {
        await this.assertAvailable(
          "asset",
          booking.assetId,
          bookingId,
          quantity,
          startDate,
          endDate,
        );
      }

      const proposedTotalAmount = await this.reprice(
        "asset",
        booking.assetId,
        booking.asset.ownerId,
        quantity,
        startDate,
        endDate,
      );

      const request = await BookingEditRequestRepo.create({
        assetBookingId: bookingId,
        requestedById,
        proposedQuantity: proposedQuantity ?? null,
        proposedStartDate: proposedStartDate ? startDate : null,
        proposedEndDate: proposedEndDate ? endDate : null,
        currentTotalAmount: booking.totalAmount,
        proposedTotalAmount,
        priceDelta: proposedTotalAmount - booking.totalAmount.toNumber(),
        reason,
        expiresAt: new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000),
      });

      announceToUser(booking.asset.ownerId, "bookings");
      NotificationService.create({
        userId: booking.asset.ownerId,
        type: "booking_edit_requested",
        title: "A citizen requested a change to their booking",
        message: `${booking.user?.name ?? "A citizen"} requested a change to their booking of ${booking.asset.name}.`,
        metadata: { link: `/booking/fulfillment/asset/${bookingId}` },
      }).catch((e) => console.error("Failed to notify owner of edit request", e));

      return request;
    }

    const booking = await ServiceBookingRepo.findById(bookingId);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requestedById) throw new Error("Unauthorized");
    if (!ACTIVE_STATUSES.includes(booking.status))
      throw new Error("This booking can no longer be edited");

    const startDate = proposedStartDate
      ? new Date(proposedStartDate)
      : booking.scheduledDate;
    const endDate = proposedEndDate
      ? new Date(proposedEndDate)
      : booking.endDate ?? startDate;

    if (proposedStartDate || proposedEndDate) {
      await this.assertAvailable(
        "service",
        booking.serviceId,
        bookingId,
        1,
        startDate,
        endDate,
      );
    }

    const proposedTotalAmount = await this.reprice(
      "service",
      booking.serviceId,
      booking.service.ownerId,
      1,
      startDate,
      endDate,
    );

    const request = await BookingEditRequestRepo.create({
      serviceBookingId: bookingId,
      requestedById,
      proposedGuestCount: proposedGuestCount ?? null,
      proposedStartDate: proposedStartDate ? startDate : null,
      proposedEndDate: proposedEndDate ? endDate : null,
      currentTotalAmount: booking.totalAmount,
      proposedTotalAmount,
      priceDelta: proposedTotalAmount - booking.totalAmount.toNumber(),
      reason,
      expiresAt: new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000),
    });

    announceToUser(booking.service.ownerId, "bookings");
    NotificationService.create({
      userId: booking.service.ownerId,
      type: "booking_edit_requested",
      title: "A citizen requested a change to their booking",
      message: `${booking.user?.name ?? "A citizen"} requested a change to their booking of ${booking.service.name}.`,
      metadata: { link: `/booking/fulfillment/service/${bookingId}` },
    }).catch((e) => console.error("Failed to notify owner of edit request", e));

    return request;
  }

  private static async loadBookingAndOwner(request: {
    assetBookingId: string | null;
    serviceBookingId: string | null;
  }) {
    if (request.assetBookingId) {
      const booking = await AssetBookingRepo.findById(request.assetBookingId);
      if (!booking) throw new Error("Asset booking not found");
      return {
        bookingKind: "asset" as BookingKind,
        booking,
        ownerId: booking.asset.ownerId,
        citizenId: booking.userId,
      };
    }
    const booking = await ServiceBookingRepo.findById(
      request.serviceBookingId!,
    );
    if (!booking) throw new Error("Service booking not found");
    return {
      bookingKind: "service" as BookingKind,
      booking,
      ownerId: booking.service.ownerId,
      citizenId: booking.userId,
    };
  }

  private static expireIfPast(request: { status: string; expiresAt: Date }) {
    if (
      request.status === BookingEditRequestStatus.pending &&
      request.expiresAt.getTime() < Date.now()
    ) {
      return true;
    }
    return false;
  }

  static async approve(id: string, respondedById: string) {
    const request = await BookingEditRequestRepo.findById(id);
    if (!request) throw new Error("Edit request not found");

    const { bookingKind, booking, ownerId, citizenId } =
      await this.loadBookingAndOwner(request);
    if (ownerId !== respondedById) throw new Error("Unauthorized");

    if (this.expireIfPast(request)) {
      await BookingEditRequestRepo.updateStatus(
        id,
        BookingEditRequestStatus.expired,
      );
      throw new Error("This edit request has expired");
    }
    if (request.status !== BookingEditRequestStatus.pending)
      throw new Error("This edit request is no longer pending");

    // The slot may have filled since the citizen submitted this request —
    // re-validate before actually applying anything. Cast to the concrete
    // shape here: `booking`'s static type is a union of the asset/service
    // include shapes, but `bookingKind` already guarantees at runtime which
    // one it actually is.
    if (bookingKind === "asset") {
      const assetBooking = booking as typeof booking & {
        assetId: string;
        quantity: number;
        startDate: Date;
        endDate: Date;
      };
      await this.assertAvailable(
        "asset",
        assetBooking.assetId,
        assetBooking.id,
        request.proposedQuantity ?? assetBooking.quantity,
        request.proposedStartDate ?? assetBooking.startDate,
        request.proposedEndDate ?? assetBooking.endDate,
      );
    } else {
      const serviceBooking = booking as typeof booking & {
        serviceId: string;
        scheduledDate: Date;
        endDate: Date | null;
      };
      await this.assertAvailable(
        "service",
        serviceBooking.serviceId,
        serviceBooking.id,
        1,
        request.proposedStartDate ?? serviceBooking.scheduledDate,
        request.proposedEndDate ??
          serviceBooking.endDate ??
          serviceBooking.scheduledDate,
      );
    }

    const priceDelta = request.priceDelta.toNumber();

    if (priceDelta > 0) {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: toStripeCents(priceDelta),
        currency: "php",
        metadata: { bookingEditRequestId: id },
        description: "Booking change — price difference",
        automatic_payment_methods: { enabled: true },
      });
      const updated = await BookingEditRequestRepo.updateStatus(
        id,
        BookingEditRequestStatus.approved,
        {
          respondedById,
          respondedAt: new Date(),
          deltaPaymentIntentId: paymentIntent.id,
        },
      );
      this.notifyApproved(bookingKind, citizenId, request, true);
      return { ...updated, deltaClientSecret: paymentIntent.client_secret };
    }

    if (priceDelta < 0) {
      const paymentTransactionId = booking.paymentTransactionId;
      let refundId: string | null = null;
      if (paymentTransactionId?.startsWith("pi_")) {
        const sr = await stripe.refunds.create({
          payment_intent: paymentTransactionId,
          amount: toStripeCents(Math.abs(priceDelta)),
        });
        refundId = sr.id;
        await prisma.refund.create({
          data: {
            [bookingKind === "asset" ? "assetBookingId" : "serviceBookingId"]:
              booking.id,
            amount: Math.abs(priceDelta),
            providerReference: sr.id,
            status:
              sr.status === "succeeded"
                ? RefundStatus.succeeded
                : RefundStatus.pending,
            reason: "Booking edit request — price decreased",
          },
        });
      }

      await this.applyChange(bookingKind, request);
      const updated = await BookingEditRequestRepo.updateStatus(
        id,
        BookingEditRequestStatus.approved,
        {
          respondedById,
          respondedAt: new Date(),
          appliedAt: new Date(),
          deltaRefundId: refundId,
        },
      );
      this.notifyApproved(bookingKind, citizenId, request, false);
      announceToAdmins("bookings");
      return updated;
    }

    await this.applyChange(bookingKind, request);
    const updated = await BookingEditRequestRepo.updateStatus(
      id,
      BookingEditRequestStatus.approved,
      { respondedById, respondedAt: new Date(), appliedAt: new Date() },
    );
    this.notifyApproved(bookingKind, citizenId, request, false);
    announceToAdmins("bookings");
    return updated;
  }

  private static notifyApproved(
    bookingKind: BookingKind,
    citizenId: string,
    request: { assetBookingId: string | null; serviceBookingId: string | null },
    paymentRequired: boolean,
  ) {
    announceToUser(citizenId, "bookings");
    const bookingId = request.assetBookingId ?? request.serviceBookingId;
    NotificationService.create({
      userId: citizenId,
      type: "booking_edit_approved",
      title: "Your booking change was approved",
      message: paymentRequired
        ? "The provider approved your requested change. Pay the price difference to confirm it."
        : "The provider approved your requested change — it's already been applied.",
      metadata: { link: `/booking/fulfillment/${bookingKind}/${bookingId}` },
    }).catch((e) =>
      console.error("Failed to notify citizen of approval", e),
    );
  }

  private static async applyChange(
    bookingKind: BookingKind,
    request: {
      id: string;
      assetBookingId: string | null;
      serviceBookingId: string | null;
      proposedQuantity: number | null;
      proposedGuestCount: number | null;
      proposedStartDate: Date | null;
      proposedEndDate: Date | null;
      proposedTotalAmount: Prisma.Decimal;
    },
  ) {
    if (bookingKind === "asset") {
      await prisma.assetBooking.update({
        where: { id: request.assetBookingId! },
        data: {
          quantity: request.proposedQuantity ?? undefined,
          startDate: request.proposedStartDate ?? undefined,
          endDate: request.proposedEndDate ?? undefined,
          totalAmount: request.proposedTotalAmount,
        },
      });
      return;
    }
    await prisma.serviceBooking.update({
      where: { id: request.serviceBookingId! },
      data: {
        guestCount: request.proposedGuestCount ?? undefined,
        scheduledDate: request.proposedStartDate ?? undefined,
        endDate: request.proposedEndDate ?? undefined,
        totalAmount: request.proposedTotalAmount,
      },
    });
  }

  static async confirmDeltaPayment(id: string, requesterId: string) {
    const request = await BookingEditRequestRepo.findById(id);
    if (!request) throw new Error("Edit request not found");
    if (request.status !== BookingEditRequestStatus.approved)
      throw new Error("This edit request isn't awaiting payment");
    if (!request.deltaPaymentIntentId)
      throw new Error("No payment is pending for this edit request");

    const { bookingKind, citizenId } = await this.loadBookingAndOwner(request);
    if (citizenId !== requesterId) throw new Error("Unauthorized");

    const pi = await stripe.paymentIntents.retrieve(
      request.deltaPaymentIntentId,
    );
    if (pi.status !== "succeeded")
      throw new Error("Payment has not completed yet");

    await this.applyChange(bookingKind, request);
    const updated = await BookingEditRequestRepo.updateStatus(
      id,
      BookingEditRequestStatus.approved,
      { appliedAt: new Date() },
    );
    announceToUser(citizenId, "bookings");
    announceToAdmins("bookings");
    return updated;
  }

  static async decline(
    id: string,
    respondedById: string,
    declineReason?: string,
  ) {
    const request = await BookingEditRequestRepo.findById(id);
    if (!request) throw new Error("Edit request not found");
    const { bookingKind, ownerId, citizenId } =
      await this.loadBookingAndOwner(request);
    if (ownerId !== respondedById) throw new Error("Unauthorized");
    if (request.status !== BookingEditRequestStatus.pending)
      throw new Error("This edit request is no longer pending");

    const updated = await BookingEditRequestRepo.updateStatus(
      id,
      BookingEditRequestStatus.declined,
      { respondedById, respondedAt: new Date(), declineReason },
    );

    announceToUser(citizenId, "bookings");
    const bookingId = request.assetBookingId ?? request.serviceBookingId;
    NotificationService.create({
      userId: citizenId,
      type: "booking_edit_declined",
      title: "Your booking change request was declined",
      message: declineReason
        ? `The provider declined your request: ${declineReason}`
        : "The provider declined your requested change.",
      metadata: { link: `/booking/fulfillment/${bookingKind}/${bookingId}` },
    }).catch((e) => console.error("Failed to notify citizen of decline", e));

    return updated;
  }

  static async withdraw(id: string, requesterId: string) {
    const request = await BookingEditRequestRepo.findById(id);
    if (!request) throw new Error("Edit request not found");
    const { citizenId } = await this.loadBookingAndOwner(request);
    if (citizenId !== requesterId) throw new Error("Unauthorized");
    if (request.status !== BookingEditRequestStatus.pending)
      throw new Error("This edit request is no longer pending");

    return BookingEditRequestRepo.updateStatus(
      id,
      BookingEditRequestStatus.withdrawn,
    );
  }

  static async getForBooking(
    bookingKind: BookingKind,
    bookingId: string,
    viewerId: string,
  ) {
    const request = await BookingEditRequestRepo.findLatestForBooking(
      bookingKind,
      bookingId,
    );
    if (!request) return null;

    const isExpired = this.expireIfPast(request);
    const status = isExpired
      ? BookingEditRequestStatus.expired
      : request.status;
    if (isExpired) {
      await BookingEditRequestRepo.updateStatus(
        request.id,
        BookingEditRequestStatus.expired,
      );
    }

    const { ownerId, citizenId } = await this.loadBookingAndOwner(request);
    const isPending = status === BookingEditRequestStatus.pending;

    // The provider's `approve` response carries the delta PaymentIntent's
    // client_secret at creation time, but the *citizen* is who actually pays
    // it — they need it too, on a later request, once the change is
    // approved and still awaiting that payment.
    let deltaClientSecret: string | null = null;
    if (
      viewerId === citizenId &&
      status === BookingEditRequestStatus.approved &&
      !request.appliedAt &&
      request.deltaPaymentIntentId
    ) {
      try {
        const pi = await stripe.paymentIntents.retrieve(
          request.deltaPaymentIntentId,
        );
        deltaClientSecret = pi.client_secret;
      } catch (e) {
        console.error("Failed to retrieve delta PaymentIntent", e);
      }
    }

    return {
      ...request,
      status,
      deltaClientSecret,
      canApprove: isPending && viewerId === ownerId,
      canDecline: isPending && viewerId === ownerId,
      canWithdraw: isPending && viewerId === citizenId,
    };
  }
}
