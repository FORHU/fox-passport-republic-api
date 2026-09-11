import {
  AssetStatus,
  EventTemplateStatus,
  ItemBookingStatus,
  Prisma,
  ServiceStatus,
  VenueStatus,
} from "@prisma/client";
import AdminRepo, { queuePage } from "./admin.repository";
import EventRequestSvc from "../event-request/event-request.service";
import RefundSvc from "../refund/refund.service";
import { cached, invalidate, versionedCache } from "../../utils/cache.util";
import { notifyDecision } from "../notifications/decision-notification";
import { sendDecisionEmail } from "../notifications/decision-email";
import {
  announceAdminQueueChanged,
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

/**
 * Read logic for the admin surface, and the only place its caching lives.
 *
 * These endpoints were the heaviest reads in the API and had no service layer
 * to sit in - the controller talked to `prisma` directly. The queries moved to
 * `admin.repository`; the shaping and the caching are here.
 *
 * ## Two different caching arguments in one file
 *
 * `getStats` is expensive and nobody is waiting on it: a dashboard number that
 * is a minute old is still a useful dashboard number, so it expires and is
 * never invalidated.
 *
 * The queues are the opposite. An admin resolves a dispute and looks straight
 * back at the list; if their own action has not landed they will reasonably
 * conclude the tool is broken. Those are invalidated by the write paths as well
 * as expiring, and their TTLs are short, because being wrong here costs trust
 * in the console rather than a slightly stale count.
 */

/**
 * `stats` is still a named key: there is exactly one of it, it is never
 * invalidated, and it expires on its own.
 *
 * The queues are no longer named. They carry a page and a page size now, so the
 * set of keys that exists for "the disputes queue" is unbounded and unknowable
 * from a write that approved one row — which is the situation `versionedCache`
 * exists for, and the reason it is the safer shape rather than merely the
 * cheaper one: one invalidation point to get right instead of one per key.
 */
export const ADMIN_CACHE_KEYS = {
  stats: "admin:stats",
} as const;

/** Every paginated admin queue. Retired wholesale by `invalidateQueues`. */
const adminCache = versionedCache("admin");

const STATS_TTL = 60;
const QUEUE_TTL = 30;

export interface AdminStats {
  totalUsers: number;
  totalVenues: number;
  activeEvents: number;
  pendingApprovals: number;
  /**
   * A string, deliberately. The underlying sums are `Prisma.Decimal`, which
   * cannot survive a JSON round-trip as itself - it would come back from the
   * cache as a string while the uncached path returned a Decimal, and the two
   * responses would differ in type depending on cache state. Serialising it
   * here makes both paths identical, and it was already reaching the client as
   * a string via Decimal's own `toJSON`.
   */
  totalRevenue: string;
  totalBookings: number;
  bookingsByDay: number[];
  categoryStats: { category: string | null; count: number }[];
}

export default class AdminSvc {
  static async getStats(): Promise<AdminStats> {
    return cached(ADMIN_CACHE_KEYS.stats, STATS_TTL, () => this.computeStats());
  }

  private static async computeStats(): Promise<AdminStats> {
    const {
      totalUsers,
      totalVenues,
      totalEventTemplates,
      pendingRoleRequests,
      bookingTotals,
      bookingsByDayOfWeek,
      serviceBookings,
      assetBookings,
      categoryGroups,
    } = await AdminRepo.findStatsInputs();

    const eventRevenue =
      bookingTotals._sum.totalAmount ?? new Prisma.Decimal(0);
    const serviceRevenue =
      serviceBookings._sum.totalAmount ?? new Prisma.Decimal(0);
    const assetRevenue =
      assetBookings._sum.totalAmount ?? new Prisma.Decimal(0);
    const totalRevenue = eventRevenue.add(serviceRevenue).add(assetRevenue);

    // Bookings per day-of-week (0=Sun … 6=Sat), last 30 days. The database
    // counted them; this only puts the rows it found into a fixed seven-slot
    // array, because a day with no bookings has no row.
    const bookingsByDay = [0, 0, 0, 0, 0, 0, 0];
    for (const { dow, count } of bookingsByDayOfWeek) {
      if (dow >= 0 && dow <= 6) bookingsByDay[dow] = Number(count);
    }

    return {
      totalUsers,
      totalVenues,
      activeEvents: totalEventTemplates,
      pendingApprovals: pendingRoleRequests,
      totalRevenue: totalRevenue.toString(),
      totalBookings: bookingTotals._count._all,
      bookingsByDay,
      categoryStats: categoryGroups.map((g) => ({
        category: g.eventCategory,
        count: g._count.id,
      })),
    };
  }

  /**
   * The queues, paginated.
   *
   * Each returns `{ rows, total, page, limit, totalPages }`. `total` is the
   * part that was missing rather than the paging: a capped queue showed 500
   * rows and stopped, and looked exactly like a queue that happened to have
   * 500 rows in it.
   *
   * The key is built from the *clamped* page, not from what arrived on the
   * query string — `queuePage` decides both — so `?limit=1e9` cannot mint its
   * own cache entry holding the same rows as `?limit=200`.
   */
  static async getDisputes(page?: number, limit?: number) {
    return this.pagedQueue("disputes", page, limit, (skip, take) =>
      AdminRepo.findDisputedRefunds(skip, take),
    );
  }

  static async getAllRefunds(page?: number, limit?: number) {
    return this.pagedQueue("refunds", page, limit, (skip, take) =>
      AdminRepo.findAllRefunds(skip, take),
    );
  }

  static async getAssetBookingDisputes(page?: number, limit?: number) {
    return this.pagedQueue("disputes:asset", page, limit, (skip, take) =>
      AdminRepo.findDisputedAssetBookings(skip, take),
    );
  }

  static async getServiceBookingDisputes(page?: number, limit?: number) {
    return this.pagedQueue("disputes:service", page, limit, (skip, take) =>
      AdminRepo.findDisputedServiceBookings(skip, take),
    );
  }

  static async getEventTemplates(
    status?: EventTemplateStatus,
    page?: number,
    limit?: number,
  ) {
    return this.pagedQueue(
      `event-templates:${status ?? "all"}`,
      page,
      limit,
      (skip, take) => AdminRepo.findEventTemplates(status, skip, take),
    );
  }

  /** The shared shape of the five above: clamp, cache, and report the total. */
  private static async pagedQueue<T>(
    name: string,
    page: number | undefined,
    limit: number | undefined,
    load: (skip: number, take: number) => Promise<{ rows: T[]; total: number }>,
  ) {
    const clamped = queuePage(page, limit);
    const { rows, total } = await adminCache.cached(
      `${name}:${clamped.page}:${clamped.limit}`,
      QUEUE_TTL,
      () => load(clamped.skip, clamped.limit),
    );
    return {
      rows,
      total,
      page: clamped.page,
      limit: clamped.limit,
      totalPages: Math.max(1, Math.ceil(total / clamped.limit)),
    };
  }

  /**
   * Called by every admin write that changes what a queue shows.
   *
   * Deliberately blunt: it drops all of them rather than reasoning about which
   * queue a given approval touched. The lists are small and refill in one
   * query, and a precise map of write-to-queue is the thing that rots silently
   * the first time someone adds an endpoint.
   */
  static async invalidateQueues(): Promise<void> {
    // One `INCR` for every queue, every page and every status, instead of a
    // list that had to be kept in step with the key builders by hand. `stats`
    // is still named, because there is one of it.
    await Promise.all([
      invalidate(ADMIN_CACHE_KEYS.stats),
      adminCache.invalidateAll(),
    ]);
  }

  // ─── DECISIONS ────────────────────────────────────────────────────────────
  //
  // Eighteen endpoints' worth of "update a row, then tell everyone" used to sit
  // in the controller, each repeating the same four steps in the same order.
  // They are here now (§0b), and `settled()` below is that shared tail, written
  // once.

  /**
   * What every approval and rejection does after the write.
   *
   * The order matters and is the order the controller used: the admin queues
   * are retired *before* anything is announced, because the console refetches
   * the moment the socket message lands, and an announcement that arrives ahead
   * of the invalidation shows the admin their own action undone.
   *
   * `notifyDecision` and `sendDecisionEmail` are deliberately not awaited -
   * they were not before either. The decision is committed by the time we get
   * here, and a mail provider having a bad minute must not turn it into a 500.
   */
  private static async settled(decision: {
    ownerId: string | null | undefined;
    channel: "venues" | "events";
    entity: "venue" | "item" | "service" | "event template" | "event";
    emailEntity: "venue" | "asset" | "service" | "eventTemplate" | "event";
    id: string;
    approved: boolean;
    reason?: string;
  }): Promise<void> {
    announceAdminQueueChanged();
    await this.invalidateQueues();
    announceToUser(decision.ownerId, decision.channel);

    if (decision.ownerId) {
      notifyDecision({
        userId: decision.ownerId,
        entity: decision.entity,
        approved: decision.approved,
        reason: decision.reason,
      });
    }

    sendDecisionEmail({
      entity: decision.emailEntity,
      id: decision.id,
      approved: decision.approved,
      reason: decision.reason,
    });
  }

  /**
   * A refund row changed: every admin's Disputes and Refunds tables are stale,
   * and so is the citizen's own booking.
   *
   * The refund carries only `bookingId`, so the owner costs one extra query.
   * That is deliberately preferred to widening what `RefundSvc` returns - those
   * rows are sent straight back to the client as `data`, and the screens parse
   * them.
   */
  static async announceRefundChanged(
    bookingId: string | null | undefined,
  ): Promise<void> {
    announceToAdmins("disputes");
    await this.invalidateQueues();
    if (!bookingId) return;

    try {
      const booking = await AdminRepo.findBookingOwner(bookingId);
      announceToUser(booking?.userId, "bookings");
    } catch (e) {
      // Best-effort, like every other announcement: the decision is committed.
      console.error("Failed to announce a refund change:", e);
    }
  }

  /** Approve retries the refund at Stripe; reject settles it by hand. */
  static async resolveDispute(
    id: string,
    action: "approve" | "reject",
    adminId: string,
    adminNotes?: string,
  ) {
    const updated =
      action === "approve"
        ? await RefundSvc.retryRefund(id, adminId)
        : await AdminRepo.resolveRefund(id, {
            resolvedBy: adminId,
            adminNotes: adminNotes || "Rejected by admin",
          });

    await this.announceRefundChanged(updated.bookingId);
    return updated;
  }

  static async retryRefund(id: string, adminId: string) {
    const result = await RefundSvc.retryRefund(id, adminId);
    await this.announceRefundChanged(result.bookingId);
    return result;
  }

  static async resolveManualRefund(id: string, adminId: string, notes: string) {
    const result = await RefundSvc.resolveManual(id, adminId, notes);
    await this.announceRefundChanged(result.bookingId);
    return result;
  }

  static async createManualRefund(data: {
    bookingId: string;
    amount: number;
    reason: string;
    adminId: string;
  }) {
    const refund = await AdminRepo.createManualRefund(data);
    await this.announceRefundChanged(refund.bookingId);
    return refund;
  }

  static async resolveAssetBookingDispute(
    id: string,
    resolution: ItemBookingStatus,
  ) {
    const booking = await AdminRepo.updateAssetBookingStatus(id, resolution);

    announceToAdmins("disputes");
    await this.invalidateQueues();
    announceToUser(booking.userId, "bookings");
    announceToUser(booking.asset?.ownerId, "bookings");
    return booking;
  }

  static async resolveServiceBookingDispute(
    id: string,
    resolution: ItemBookingStatus,
  ) {
    const booking = await AdminRepo.updateServiceBookingStatus(id, resolution);

    announceToAdmins("disputes");
    await this.invalidateQueues();
    announceToUser(booking.userId, "bookings");
    announceToUser(booking.service?.ownerId, "bookings");
    return booking;
  }

  static async approveVenue(id: string) {
    const venue = await AdminRepo.approveVenue(id);

    // Award mayor XP + City Builder badge (fire-and-forget)
    import("../passport/passport.service")
      .then(async ({ default: PassportSvc, XP_REWARDS, UserPath }) => {
        await PassportSvc.awardXP(
          venue.mayorId,
          UserPath.venueFoxer,
          XP_REWARDS.mayorVenueApproved,
        );
        const approvedCount = await AdminRepo.countApprovedVenues(
          venue.mayorId,
        );
        if (approvedCount >= 3)
          await PassportSvc.awardBadgeByName(venue.mayorId, "City Builder");
      })
      .catch(() => {});

    await this.settled({
      ownerId: venue.mayorId,
      channel: "venues",
      entity: "venue",
      emailEntity: "venue",
      id: venue.id,
      approved: true,
    });
    return venue;
  }

  static async rejectVenue(id: string, reason?: string) {
    const venue = await AdminRepo.setVenueStatus(id, VenueStatus.archived);

    await this.settled({
      ownerId: venue.mayorId,
      channel: "venues",
      entity: "venue",
      emailEntity: "venue",
      id: venue.id,
      approved: false,
      reason,
    });
    return venue;
  }

  static async approveAsset(id: string) {
    const asset = await AdminRepo.approveAsset(id);

    import("../passport/passport.service")
      .then(({ default: PassportSvc, XP_REWARDS, UserPath }) =>
        PassportSvc.awardXP(
          asset.ownerId,
          UserPath.gearFoxer,
          XP_REWARDS.createListing,
        ),
      )
      .catch(() => {});

    // "venues" is the channel an owner's listings screen listens on - assets,
    // services and venues all share it. Carried over rather than corrected.
    await this.settled({
      ownerId: asset.ownerId,
      channel: "venues",
      entity: "item",
      emailEntity: "asset",
      id: asset.id,
      approved: true,
    });
    return asset;
  }

  static async rejectAsset(id: string, reason?: string) {
    const asset = await AdminRepo.setAssetStatus(id, AssetStatus.rejected);

    await this.settled({
      ownerId: asset.ownerId,
      channel: "venues",
      entity: "item",
      emailEntity: "asset",
      id: asset.id,
      approved: false,
      reason,
    });
    return asset;
  }

  static async approveService(id: string) {
    const service = await AdminRepo.approveService(id);

    import("../passport/passport.service")
      .then(({ default: PassportSvc, XP_REWARDS, UserPath }) =>
        PassportSvc.awardXP(
          service.ownerId,
          UserPath.serviceFoxer,
          XP_REWARDS.createListing,
        ),
      )
      .catch(() => {});

    await this.settled({
      ownerId: service.ownerId,
      channel: "venues",
      entity: "service",
      emailEntity: "service",
      id: service.id,
      approved: true,
    });
    return service;
  }

  static async rejectService(id: string, reason?: string) {
    const service = await AdminRepo.setServiceStatus(
      id,
      ServiceStatus.rejected,
    );

    await this.settled({
      ownerId: service.ownerId,
      channel: "venues",
      entity: "service",
      emailEntity: "service",
      id: service.id,
      approved: false,
      reason,
    });
    return service;
  }

  static async approveEventTemplate(id: string) {
    const template = await AdminRepo.publishEventTemplate(id);

    await this.settled({
      ownerId: template.ownerId,
      channel: "events",
      entity: "event template",
      emailEntity: "eventTemplate",
      id: template.id,
      approved: true,
    });
    return template;
  }

  static async rejectEventTemplate(id: string, reason: string) {
    const template = await AdminRepo.rejectEventTemplate(id, reason);

    await this.settled({
      ownerId: template.ownerId,
      channel: "events",
      entity: "event template",
      emailEntity: "eventTemplate",
      id: template.id,
      approved: false,
      reason,
    });
    return template;
  }

  /**
   * Through `EventRequestSvc` rather than the repository: the route is already
   * gated on `queue:decide`, and the service re-checks. Defence in depth, and
   * it keeps the dependency direction the architecture scan enforces.
   */
  static async approveEvent(id: string, adminId: string, systemRole: string) {
    const event = await EventRequestSvc.approveRequest(id, adminId, systemRole);

    // Make the parent template publicly discoverable (skip for template-less
    // events)
    if (event.templateId) {
      await AdminRepo.setTemplatePublic(event.templateId, true);
    }

    await this.settled({
      ownerId: event.clientId,
      channel: "events",
      entity: "event",
      emailEntity: "event",
      id: event.id,
      approved: true,
    });
    return event;
  }

  static async rejectEvent(
    id: string,
    reason: string | undefined,
    adminId: string,
    systemRole: string,
  ) {
    const event = await EventRequestSvc.rejectRequest(
      id,
      reason,
      adminId,
      systemRole,
    );

    // Hide the template if no other approved events remain for it (skip for
    // template-less events)
    if (event.templateId) {
      const approvedCount = await AdminRepo.countApprovedEventsForTemplate(
        event.templateId,
      );
      if (approvedCount === 0) {
        await AdminRepo.setTemplatePublic(event.templateId, false);
      }
    }

    await this.settled({
      ownerId: event.clientId,
      channel: "events",
      entity: "event",
      emailEntity: "event",
      id: event.id,
      approved: false,
      reason,
    });
    return event;
  }
}
