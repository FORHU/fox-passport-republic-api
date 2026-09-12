import { prisma } from "../../utils/prisma";
import {
  venueCache,
  eventTemplateCache,
  assetCache,
  serviceCache,
} from "../../utils/cache-namespaces";
import {
  Prisma,
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
 * than smaller. A cap on the newest rows bounded it, and the note here used to
 * say that a queue reaching the cap meant the console was no longer the tool
 * for it - "the fix is pagination, not a bigger number".
 *
 * This is that fix. The queues are paginated, so the cap is a page size rather
 * than a ceiling on what is reachable, and every one returns its `total` so
 * the console can say how many there are rather than showing 500 and stopping
 * silently. That silence was the actual defect: a full queue and a queue with
 * exactly 500 rows looked identical.
 */

/** Rows per page when the caller does not say. */
export const QUEUE_PAGE_SIZE = 50;

/** The largest page anyone may ask for, so a caller cannot re-create the old
 *  unbounded read by passing `?limit=100000`. */
export const QUEUE_MAX_PAGE_SIZE = 200;

/** A page of rows, and how many there are in total. */
export interface Page<T> {
  rows: T[];
  total: number;
}

/**
 * Clamps whatever arrived on the query string into a page that is safe to run.
 *
 * Exported because the service caches on these values and has to key on the
 * *clamped* ones - keying on the raw input would mint a distinct cache entry
 * for `?limit=1e9` and every other junk value, all holding the same rows.
 */
export function queuePage(page?: number, limit?: number) {
  const size = Math.min(
    Math.max(Math.trunc(limit || QUEUE_PAGE_SIZE), 1),
    QUEUE_MAX_PAGE_SIZE,
  );
  const current = Math.max(Math.trunc(page || 1), 1);
  return { page: current, limit: size, skip: (current - 1) * size };
}

export default class AdminRepo {
  /** Refunds that failed or are still pending - the disputes queue. */
  static async findDisputedRefunds(skip = 0, take = QUEUE_PAGE_SIZE) {
    const where: Prisma.RefundWhereInput = {
      status: { in: ["failed", "pending"] },
    };
    const [rows, total] = await Promise.all([
      prisma.refund.findMany({
        where,
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
        skip,
        take,
      }),
      prisma.refund.count({ where }),
    ]);
    return { rows, total };
  }

  static async findAllRefunds(skip = 0, take = QUEUE_PAGE_SIZE) {
    const [rows, total] = await Promise.all([
      prisma.refund.findMany({
        include: {
          booking: { select: { id: true, totalAmount: true } },
          payment: { select: { method: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.refund.count(),
    ]);
    return { rows, total };
  }

  static async findDisputedAssetBookings(skip = 0, take = QUEUE_PAGE_SIZE) {
    const where: Prisma.AssetBookingWhereInput = { status: "disputed" };
    const [rows, total] = await Promise.all([
      prisma.assetBooking.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.assetBooking.count({ where }),
    ]);
    return { rows, total };
  }

  static async findDisputedServiceBookings(skip = 0, take = QUEUE_PAGE_SIZE) {
    const where: Prisma.ServiceBookingWhereInput = { status: "disputed" };
    const [rows, total] = await Promise.all([
      prisma.serviceBooking.findMany({
        where,
        include: {
          service: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.serviceBooking.count({ where }),
    ]);
    return { rows, total };
  }

  static async findEventTemplates(
    status?: EventTemplateStatus,
    skip = 0,
    take = QUEUE_PAGE_SIZE,
  ) {
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      prisma.eventTemplate.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          images: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.eventTemplate.count({ where }),
    ]);
    return { rows, total };
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
    // No `resolved`/`resolvedBy`/`resolvedAt`/`adminNotes` columns any more —
    // moving status to `succeeded` is itself the resolution (see
    // `RefundSvc.getFailedRefunds`); the note is folded into `reason`, the
    // one surviving free-text field, rather than dropped.
    return prisma.refund.update({
      where: { id },
      data: {
        status: "succeeded",
        reason: data.adminNotes,
      },
    });
  }

  static async createManualRefund(data: {
    bookingId: string;
    amount: number;
    reason: string;
    adminId: string;
    paymentId: string;
  }) {
    // No `currency`/`initiatedBy`/`resolved`/`resolvedBy`/`resolvedAt`
    // columns any more — see `resolveRefund` above.
    return prisma.refund.create({
      data: {
        bookingId: data.bookingId,
        paymentId: data.paymentId,
        amount: data.amount,
        status: "succeeded",
        reason: data.reason,
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
    const venue = await prisma.venue.update({
      where: { id },
      data: { status },
    });
    // The mayor is refreshing to see whether their venue went live, so this is
    // the write that must not wait for a TTL. `VenueRepo` retires the same
    // namespace for the writes it owns.
    await venueCache.invalidateAll();
    return venue;
  }

  static async approveVenue(id: string) {
    const venue = await prisma.venue.update({
      where: { id },
      data: { status: VenueStatus.available },
      select: { id: true, mayorId: true },
    });
    await venueCache.invalidateAll();
    return venue;
  }

  static async countApprovedVenues(mayorId: string) {
    return prisma.venue.count({
      where: { mayorId, status: VenueStatus.available },
    });
  }

  static async approveAsset(id: string) {
    const row = await prisma.asset.update({
      where: { id },
      data: { status: AssetStatus.available },
      select: { id: true, ownerId: true },
    });
    // The owner is watching the page for the approval.
    await assetCache.invalidateAll();
    return row;
  }

  static async setAssetStatus(id: string, status: AssetStatus) {
    const row = await prisma.asset.update({ where: { id }, data: { status } });
    await assetCache.invalidateAll();
    return row;
  }

  static async approveService(id: string) {
    const row = await prisma.service.update({
      where: { id },
      data: { status: ServiceStatus.available },
      select: { id: true, ownerId: true },
    });
    await serviceCache.invalidateAll();
    return row;
  }

  static async setServiceStatus(id: string, status: ServiceStatus) {
    const row = await prisma.service.update({
      where: { id },
      data: { status },
    });
    await serviceCache.invalidateAll();
    return row;
  }

  static async publishEventTemplate(id: string) {
    const template = await prisma.eventTemplate.update({
      where: { id },
      data: { status: EventTemplateStatus.published, isPublic: true },
    });
    await eventTemplateCache.invalidateAll();
    return template;
  }

  static async rejectEventTemplate(id: string, reason: string) {
    const template = await prisma.eventTemplate.update({
      where: { id },
      data: {
        status: EventTemplateStatus.rejected,
        isPublic: false,
        rejectionReason: reason,
      },
    });
    // The owner is watching the page for this exact transition.
    await eventTemplateCache.invalidateAll();
    return template;
  }

  /** Approving an event publishes its template; rejecting the last one hides it. */
  static async setTemplatePublic(id: string, isPublic: boolean) {
    const template = await prisma.eventTemplate.update({
      where: { id },
      data: { isPublic },
    });
    // Publishing is what makes a template appear in the public listings.
    await eventTemplateCache.invalidateAll();
    return template;
  }

  static async countApprovedEventsForTemplate(templateId: string) {
    return prisma.event.count({
      where: { templateId, requestStatus: "approved" },
    });
  }
}
