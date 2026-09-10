import { Prisma, TransactionStatus, UserPath } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { passportCache } from "../../utils/cache-namespaces";

/**
 * Every passport query, in one place.
 *
 * The module had no repository at all — 20 direct `prisma` calls in the
 * service, the largest single share of the `REDIS-PLAN.md` §3 count. Two things
 * made it the one worth doing first.
 *
 * **The cache invalidation was scattered across six write sites** in
 * `passport.service.ts`, one `await passportCache.invalidateAll()` per write,
 * added by hand and remembered by hand. That is the arrangement §0 of the plan
 * re-opened and rejected for bookings — "remember to call it" is not a good
 * enough rule, because the write somebody forgets is the one that matters. It
 * is now a single `retiring` helper, the same shape `BookingRepo`,
 * `VenueRepo`, `AssetRepo`, `ServiceRepo`, `UsersRepo`, `ProfileRepo`,
 * `FollowRepo`, `EventTemplateRepo` and `InvestmentRepo` all use.
 *
 * **The XP path is the hottest write in the system.** XP is awarded for
 * ordinary actions, so these writes run constantly, and every one of them
 * retires a namespace that every listing page reads through `getPerks`. Having
 * them in one file is what makes that cost visible rather than incidental.
 *
 * The reads stay uncached here on purpose: caching belongs in the service, and
 * `cache.util.ts` says why.
 */

/** The shape the passport screen renders, and `awardXP` reads `paths` from. */
const fullPassport = {
  paths: true,
  stamps: { orderBy: { createdAt: "desc" } },
  userBadges: { include: { badge: true } },
} satisfies Prisma.PassportInclude;

export default class PassportRepo {
  /**
   * Retires the cached passport reads.
   *
   * Wrapped around every write rather than called from the service, for the
   * reason `BookingRepo` gives: a write that forgets is somebody who has just
   * levelled up looking at the level they had before.
   */
  private static async retiring<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await passportCache.invalidateAll();
    return result;
  }

  // ---- reads -------------------------------------------------------------

  /** The badge catalogue, ordered the way the passport screen renders it. */
  static async findAllBadges() {
    return prisma.badge.findMany({
      orderBy: [{ path: "asc" }, { rarity: "asc" }],
    });
  }

  static async findBadgeByName(name: string) {
    return prisma.badge.findUnique({ where: { name } });
  }

  static async findByUserId(userId: string) {
    return prisma.passport.findUnique({
      where: { userId },
      include: fullPassport,
    });
  }

  /** Just the perk keys — what every listing page reads, once per owner. */
  static async findPerksByUserId(userId: string) {
    return prisma.passport.findUnique({
      where: { userId },
      select: { perks: true },
    });
  }

  /** The same, addressed by passport id, which the perk-granting path holds. */
  static async findPerksById(passportId: string) {
    return prisma.passport.findUnique({
      where: { id: passportId },
      select: { perks: true },
    });
  }

  /** Perks for many owners at once, for `enrichWithOwnerBadge`. */
  static async findPerksForUsers(userIds: string[]) {
    return prisma.passport.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, perks: true },
    });
  }

  /** Every passport with its paths, for the leaderboard. */
  static async findAllWithPaths() {
    return prisma.passport.findMany({
      include: {
        paths: true,
        user: { select: { id: true, name: true, imgId: true, roleType: true } },
      },
    });
  }

  /** The booking a stamp would be issued for, with what the stamp displays. */
  static async findBookingForStamp(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            startAt: true,
            targetCity: true,
            targetCountry: true,
          },
        },
        user: { select: { id: true } },
      },
    });
  }

  static async findStampByBooking(bookingId: string) {
    return prisma.passportStamp.findUnique({ where: { bookingId } });
  }

  /**
   * The venue actually confirmed for this booking.
   *
   * Scoped by `bookingId` because an event can host many bookings, filtered on
   * `included` because a guest does not visit the venue options they declined,
   * and on `approved` because the Venue Foxer's transaction has to have gone
   * through. An unscoped lookup can stamp a passport with a venue the guest
   * never went to.
   */
  static async findApprovedVenueForBooking(bookingId: string) {
    return prisma.eventVenueTransaction.findFirst({
      where: { bookingId, included: true, status: TransactionStatus.approved },
      orderBy: { createdAt: "asc" },
      select: {
        venueId: true,
        venue: {
          select: { id: true, name: true, city: true, stampIconUrl: true },
        },
      },
    });
  }

  /** Distinct venues this passport has stamps from, for the milestone badges. */
  static async findDistinctStampVenues(passportId: string) {
    return prisma.passportStamp.groupBy({
      by: ["venueId"],
      where: { passportId, venueId: { not: null } },
    });
  }

  // ---- writes ------------------------------------------------------------

  /** An upsert is a write: it may create the passport it returns. */
  static async upsertPassport(userId: string) {
    return this.retiring(
      prisma.passport.upsert({
        where: { userId },
        create: { userId },
        update: {},
        include: fullPassport,
      }),
    );
  }

  static async upsertUserBadge(passportId: string, badgeId: string) {
    return this.retiring(
      prisma.userBadge.upsert({
        where: { passportId_badgeId: { passportId, badgeId } },
        create: { passportId, badgeId },
        update: {},
      }),
    );
  }

  static async upsertPath(params: {
    passportId: string;
    path: UserPath;
    level: number;
    currentXP: number;
    totalXP: number;
  }) {
    const { passportId, path, level, currentXP, totalXP } = params;
    return this.retiring(
      prisma.passportPath.upsert({
        where: { passportId_path: { passportId, path } },
        create: { passportId, path, level, currentXP, totalXP },
        update: { level, currentXP, totalXP },
      }),
    );
  }

  /** Appends perks. The caller decides which are new; this only writes them. */
  static async pushPerks(passportId: string, perks: string[]) {
    return this.retiring(
      prisma.passport.update({
        where: { id: passportId },
        data: { perks: { push: perks } },
      }),
    );
  }

  static async createStamp(data: Prisma.PassportStampUncheckedCreateInput) {
    return this.retiring(prisma.passportStamp.create({ data }));
  }
}
