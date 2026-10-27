import { prisma, AppTransactionClient } from "../../utils/prisma";
import { EventStatus, Prisma, RequestStatus } from "@prisma/client";
import { toEnum } from "../../utils/enums";

export default class EventRequestRepo {
  static async create(
    data: Prisma.EventCreateInput,
    tx: AppTransactionClient = prisma,
  ) {
    return tx.event.create({
      data,
      include: {
        assetTransactions: true,
        serviceTransactions: true,
        venueTransactions: true,
      },
    });
  }

  // Shared template include (images come from the template)
  private static readonly templateInclude = {
    select: {
      name: true,
      category: true,
      images: true,
    },
  } as const;

  // Public landing page — approved events only
  static async findAllApproved() {
    return prisma.event.findMany({
      where: { requestStatus: "approved" },
      include: {
        template: EventRequestRepo.templateInclude,
        host: { select: { name: true, email: true } },
      },
      orderBy: { startAt: "asc" },
    });
  }

  // Authenticated — own events (as client or host)
  static async findAll(filters: { clientId?: string; organizerId?: string }) {
    return prisma.event.findMany({
      where: {
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.organizerId && { organizerId: filters.organizerId }),
      },
      include: {
        template: EventRequestRepo.templateInclude,
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Admin — all events with any status
  static async findAllAdmin(filters?: { requestStatus?: string }) {
    // An unrecognised status drops the filter rather than failing the query.
    const requestStatus = toEnum(RequestStatus, filters?.requestStatus);
    return prisma.event.findMany({
      where: {
        ...(requestStatus && { requestStatus }),
      },
      include: {
        template: EventRequestRepo.templateInclude,
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        template: { include: { images: true } },
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
        assetTransactions: {
          include: {
            asset: { include: { images: true } },
            provider: { select: { name: true } },
          },
        },
        serviceTransactions: {
          include: {
            service: { include: { images: true } },
            provider: { select: { name: true } },
          },
        },
        venueTransactions: {
          include: {
            venue: { include: { images: true } },
            provider: { select: { name: true } },
          },
        },
        bookings: true,
      },
    });
  }

  /**
   * Moves the Event to `status` only while it is still in one of `from`, in a
   * single write. The count says whether this call made the change, which is
   * what keeps completion XP to one payout.
   */
  static async advanceStatus(
    id: string,
    from: EventStatus[],
    status: EventStatus,
  ) {
    const { count } = await prisma.event.updateMany({
      where: { id, eventStatus: { in: from } },
      data: { eventStatus: status },
    });
    return count === 1;
  }

  /**
   * Events that ended before `before` with live bookings and no check-in,
   * still unsettled and not yet flagged (EventRequestSvc.flagUnattendedPast).
   */
  static async findUnattendedPast(before: Date) {
    return prisma.event.findMany({
      where: {
        endAt: { lt: before },
        reviewFlaggedAt: null,
        eventStatus: { notIn: [EventStatus.completed, EventStatus.cancelled] },
        bookings: {
          some: { status: { not: "cancelled" } },
          none: { checkedIn: true },
        },
      },
      select: { id: true, name: true, organizerId: true },
    });
  }

  /**
   * Flags an Event for review once. The null in the `where` makes the write
   * the claim: of sweeps running at once, exactly one gets `true`.
   */
  static async claimReviewFlag(id: string, at: Date) {
    const { count } = await prisma.event.updateMany({
      where: { id, reviewFlaggedAt: null },
      data: { reviewFlaggedAt: at },
    });
    return count === 1;
  }

  /** Flagged Events still waiting for a person to settle them, oldest first. */
  static async findNeedingReview() {
    return prisma.event.findMany({
      where: {
        reviewFlaggedAt: { not: null },
        eventStatus: { notIn: [EventStatus.completed, EventStatus.cancelled] },
      },
      include: {
        template: EventRequestRepo.templateInclude,
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
        // What the admin settles, one by one.
        bookings: {
          select: {
            id: true,
            status: true,
            checkedIn: true,
            guestCount: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { reviewFlaggedAt: "asc" },
    });
  }

  static async bookingStatuses(eventId: string) {
    return prisma.booking.findMany({
      where: { eventId },
      select: { status: true, checkedIn: true },
    });
  }

  static async updateRequestStatus(id: string, status: RequestStatus) {
    return prisma.event.update({
      where: { id },
      data: { requestStatus: status },
    });
  }

  static async rejectRequest(id: string, reason?: string) {
    return prisma.event.update({
      where: { id },
      data: { requestStatus: "rejected", rejectionReason: reason ?? null },
    });
  }
}
