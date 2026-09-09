import { prisma } from "../../utils/prisma";
import {
  AssetStatus,
  BookingStatus,
  EventTemplateStatus,
  ItemBookingStatus,
  RequestStatus,
  ServiceStatus,
  VenueStatus,
} from "@prisma/client";

/**
 * The admin read queries, which lived in the controller.
 *
 * `admin.controller.ts` held 31 direct `prisma` calls across 18 GET endpoints -
 * the heaviest read surface in the API and the only module with no data layer
 * at all. The architecture validator never objected because `prisma` is
 * imported from `utils`, which every layer may use; the rule it enforces is
 * about importing *layers*, and a controller reaching straight past its own
 * service to the database does not trip it.
 *
 * Moved verbatim. Nothing here changes what a query returns - the shaping and
 * the decisions live in `admin.service.ts`, so this is a relocation and not a
 * rewrite.
 *
 * The decision *writes* followed on 9 Sep, when the rest of the controller's
 * logic moved out (§0b). They are as narrow as the reads: each one is a single
 * status change, and everything that surrounds a decision - the XP award, the
 * announcement, the notification, the email - is the service's.
 */
/**
 * A ceiling, not pagination.
 *
 * Every queue below was unbounded: each one read its whole table, of all time,
 * on every dashboard load, and caching them made that growth invisible rather
 * than smaller. The console has no pagination to offer instead, so the bound is
 * a cap on the newest rows - the queues are ordered newest-first, and an admin
 * working a queue works the top of it.
 *
 * If a queue ever reaches this, the console is not the tool for that queue any
 * more and the fix is pagination, not a bigger number.
 */
const QUEUE_LIMIT = 500;

export default class AdminRepo {
  /** Refunds that failed or are still pending - the disputes queue. */
  static async findDisputedRefunds() {
    return prisma.refund.findMany({
      where: { status: { in: ["failed", "pending"] } },
      include: {
        booking: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: { select: { id: true, name: true, startAt: true } },
          },
        },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: QUEUE_LIMIT,
    });
  }

  static async findAllRefunds() {
    return prisma.refund.findMany({
      include: {
        booking: { select: { id: true, totalAmount: true } },
        payment: { select: { method: true } },
      },
      orderBy: { createdAt: "desc" },
      take: QUEUE_LIMIT,
    });
  }

  static async findDisputedAssetBookings() {
    return prisma.assetBooking.findMany({
      where: { status: "disputed" },
      include: {
        asset: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: QUEUE_LIMIT,
    });
  }

  static async findDisputedServiceBookings() {
    return prisma.serviceBooking.findMany({
      where: { status: "disputed" },
      include: {
        service: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: QUEUE_LIMIT,
    });
  }

  static async findEventTemplates(status?: EventTemplateStatus) {
    return prisma.eventTemplate.findMany({
      where: status ? { status } : {},
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
      orderBy: { createdAt: "desc" },
      take: QUEUE_LIMIT,
    });
  }

  /**
   * The dashboard's eight queries.
   *
   * **This used to load every non-cancelled booking ever made** so the caller
   * could sum revenue and bucket the last thirty days by day of week - growing
   * forever, and discarding almost everything it fetched. Postgres does both
   * now: one `aggregate` for the sum and the count, and one grouped query for
   * the buckets, which reads only the last thirty days.
   *
   * One difference worth knowing. The buckets used to come from
   * `new Date(createdAt).getDay()`, which is the day of week in the API
   * process's timezone; they now come from `EXTRACT(DOW ...)`, which is the
   * database session's. Those agree when both run in UTC and can differ by one
   * bucket at the edges of a day when they do not. For a dashboard chart that
   * is a fair trade for a query that no longer grows without limit.
   */
  static async findStatsInputs() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalVenues,
      totalEventTemplates,
      pendingRoleRequests,
      bookingTotals,
      bookingsByDayOfWeek,
      serviceBookings,
      assetBookings,
      categoryGroups,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.venue.count(),
      prisma.eventTemplate.count(),
      prisma.roleRequest.count({ where: { status: RequestStatus.pending } }),
      prisma.booking.aggregate({
        where: { status: { not: BookingStatus.cancelled } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      // Day of week (0 = Sunday) against the last thirty days only. Raw
      // because Prisma's `groupBy` cannot group on an expression, and the
      // expression - not the column - is the whole point.
      prisma.$queryRaw<{ dow: number; count: number }[]>`
        SELECT EXTRACT(DOW FROM "createdAt")::int AS dow,
               COUNT(*)::int AS count
          FROM "bookings"
         WHERE "status"::text <> ${BookingStatus.cancelled}
           AND "createdAt" >= ${thirtyDaysAgo}
         GROUP BY 1
      `,
      prisma.serviceBooking.aggregate({ _sum: { totalAmount: true } }),
      prisma.assetBooking.aggregate({ _sum: { totalAmount: true } }),
      prisma.event.groupBy({ by: ["eventCategory"], _count: { id: true } }),
    ]);

    return {
      totalUsers,
      totalVenues,
      totalEventTemplates,
      pendingRoleRequests,
      bookingTotals,
      bookingsByDayOfWeek,
      serviceBookings,
      assetBookings,
      categoryGroups,
    };
  }

  // ─── DECISION WRITES ──────────────────────────────────────────────────────

  /** The owner of a booking, for announcing a refund change to them. */
  static async findBookingOwner(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    });
  }

  /**
   * An admin rejecting a disputed refund. `succeeded` with `resolved` is what
   * "the admin settled this by hand" looks like in this table - it was written
   * that way in the controller and is carried over unchanged.
   */
  static async resolveRefund(
    id: string,
    data: { resolvedBy: string; adminNotes: string },
  ) {
    return prisma.refund.update({
      where: { id },
      data: {
        status: "succeeded",
        resolved: true,
        resolvedBy: data.resolvedBy,
        resolvedAt: new Date(),
        adminNotes: data.adminNotes,
      },
    });
  }

  static async createManualRefund(data: {
    bookingId: string;
    amount: number;
    reason: string;
    adminId: string;
  }) {
    return prisma.refund.create({
      data: {
        bookingId: data.bookingId,
        amount: data.amount,
        currency: "PHP",
        status: "succeeded",
        initiatedBy: data.adminId,
        adminNotes: data.reason,
        resolved: true,
        resolvedBy: data.adminId,
        resolvedAt: new Date(),
      },
    });
  }

  static async updateAssetBookingStatus(id: string, status: ItemBookingStatus) {
    return prisma.assetBooking.update({
      where: { id },
      data: { status },
      include: { asset: { select: { ownerId: true } } },
    });
  }

  static async updateServiceBookingStatus(
    id: string,
    status: ItemBookingStatus,
  ) {
    return prisma.serviceBooking.update({
      where: { id },
      data: { status },
      include: { service: { select: { ownerId: true } } },
    });
  }

  // Venues. The approval selects narrowly because the badge check needs only
  // the mayor; the rejection returns the row, as the controller had it.
  static async setVenueStatus(id: string, status: VenueStatus) {
    return prisma.venue.update({ where: { id }, data: { status } });
  }

  static async approveVenue(id: string) {
    return prisma.venue.update({
      where: { id },
      data: { status: VenueStatus.available },
      select: { id: true, mayorId: true },
    });
  }

  static async countApprovedVenues(mayorId: string) {
    return prisma.venue.count({
      where: { mayorId, status: VenueStatus.available },
    });
  }

  static async approveAsset(id: string) {
    return prisma.asset.update({
      where: { id },
      data: { status: AssetStatus.available },
      select: { id: true, ownerId: true },
    });
  }

  static async setAssetStatus(id: string, status: AssetStatus) {
    return prisma.asset.update({ where: { id }, data: { status } });
  }

  static async approveService(id: string) {
    return prisma.service.update({
      where: { id },
      data: { status: ServiceStatus.available },
      select: { id: true, ownerId: true },
    });
  }

  static async setServiceStatus(id: string, status: ServiceStatus) {
    return prisma.service.update({ where: { id }, data: { status } });
  }

  static async publishEventTemplate(id: string) {
    return prisma.eventTemplate.update({
      where: { id },
      data: { status: EventTemplateStatus.published, isPublic: true },
    });
  }

  static async rejectEventTemplate(id: string, reason: string) {
    return prisma.eventTemplate.update({
      where: { id },
      data: {
        status: EventTemplateStatus.rejected,
        isPublic: false,
        rejectionReason: reason,
      },
    });
  }

  /** Approving an event publishes its template; rejecting the last one hides it. */
  static async setTemplatePublic(id: string, isPublic: boolean) {
    return prisma.eventTemplate.update({ where: { id }, data: { isPublic } });
  }

  static async countApprovedEventsForTemplate(templateId: string) {
    return prisma.event.count({
      where: { templateId, requestStatus: "approved" },
    });
  }
}
