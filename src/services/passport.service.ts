import { UserPath } from "@prisma/client";
import { prisma } from "../utils/prisma";

const XP_PER_LEVEL = 1000;
const XP_MULTIPLIER = 1.15;

// XP earned per action (mirrors FE constants)
const XP_REWARDS = {
  attendEvent: 100,
  leaveReview: 25,
  createListing: 100,
  listingBooked: 150,
  completeEvent: 200,
  receive5StarReview: 50,
  uploadVenue: 75,
  venueBooked: 100,
  mayorVenueApproved: 200,
};

function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.round(XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, i - 1));
  }
  return total;
}

function calculateLevel(totalXP: number): { level: number; currentXP: number; requiredXP: number } {
  let level = 1;
  while (totalXP >= xpRequiredForLevel(level + 1)) {
    level++;
  }
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  return {
    level,
    currentXP: totalXP - levelStart,
    requiredXP: levelEnd - levelStart,
  };
}

export default class PassportSvc {
  static async getOrCreate(userId: string) {
    return prisma.passport.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { paths: true, stamps: { orderBy: { createdAt: "desc" } }, userBadges: { include: { badge: true } } },
    });
  }

  static async getByUserId(userId: string) {
    return prisma.passport.findUnique({
      where: { userId },
      include: {
        paths: true,
        stamps: { orderBy: { createdAt: "desc" } },
        userBadges: { include: { badge: true } },
      },
    });
  }

  // Idempotent badge award — skips silently if badge not found or already earned.
  static async awardBadgeByName(userId: string, badgeName: string) {
    const badge = await prisma.badge.findUnique({ where: { name: badgeName } });
    if (!badge) return;
    const passport = await PassportSvc.getOrCreate(userId);
    await prisma.userBadge.upsert({
      where: { passportId_badgeId: { passportId: passport.id, badgeId: badge.id } },
      create: { passportId: passport.id, badgeId: badge.id },
      update: {},
    });
  }

  static async awardXP(userId: string, path: UserPath, amount: number) {
    const passport = await PassportSvc.getOrCreate(userId);

    const existing = passport.paths.find((p) => p.path === path);
    const prevLevel = existing?.level ?? 1;
    const newTotalXP = (existing?.totalXP ?? 0) + amount;
    const { level, currentXP, requiredXP } = calculateLevel(newTotalXP);

    await prisma.passportPath.upsert({
      where: { passportId_path: { passportId: passport.id, path } },
      create: { passportId: passport.id, path, level, currentXP, totalXP: newTotalXP },
      update: { level, currentXP, totalXP: newTotalXP },
    });

    // Award level-based badges when crossing thresholds
    if (level !== prevLevel && path === UserPath.venueFoxer) {
      if (prevLevel < 3 && level >= 3) PassportSvc.awardBadgeByName(userId, "District Champion").catch(() => {});
      if (prevLevel < 18 && level >= 18) PassportSvc.awardBadgeByName(userId, "Grand Mayor").catch(() => {});
    }

    return { level, currentXP, requiredXP, totalXP: newTotalXP };
  }

  // Called automatically when a Booking reaches `completed` status.
  // Idempotent — safe to call multiple times (unique constraint on bookingId).
  static async issueStamp(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: { select: { name: true, startAt: true, targetCity: true, targetCountry: true } },
        user: { select: { id: true } },
      },
    });
    if (!booking) return;

    const passport = await PassportSvc.getOrCreate(booking.userId);

    // Idempotent — if stamp already exists for this booking, skip
    const existing = await prisma.passportStamp.findUnique({ where: { bookingId } });
    if (existing) return;

    const location = [booking.event?.targetCity, booking.event?.targetCountry]
      .filter(Boolean)
      .join(", ") || null;

    await prisma.passportStamp.create({
      data: {
        passportId: passport.id,
        bookingId,
        eventName: booking.event?.name ?? "Event",
        eventDate: booking.startAt,
        location,
        xpEarned: XP_REWARDS.attendEvent,
      },
    });

    await PassportSvc.awardXP(booking.userId, UserPath.user, XP_REWARDS.attendEvent);
  }
}

export { XP_REWARDS, UserPath };
