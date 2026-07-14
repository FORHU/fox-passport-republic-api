import { PrismaClient, UserPath } from "@prisma/client";

const XP_PER_LEVEL = 1000;
const XP_MULTIPLIER = 1.15;

function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.round(XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, i - 1));
  }
  return total;
}

function calculateLevel(totalXP: number) {
  let level = 1;
  while (totalXP >= xpRequiredForLevel(level + 1)) level++;
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  return { level, currentXP: totalXP - levelStart, requiredXP: levelEnd - levelStart };
}

type PathXP = { path: UserPath; totalXP: number };

const USER_PASSPORT_DATA: Record<string, PathXP[]> = {
  "admin@example.com": [
    { path: UserPath.user, totalXP: 500 },
  ],
  "mayor@example.com": [
    { path: UserPath.user,       totalXP: 3200 },
    { path: UserPath.venueFoxer, totalXP: 6800 },
  ],
  "host@example.com": [
    { path: UserPath.user,       totalXP: 2400 },
    { path: UserPath.eventFoxer, totalXP: 9500 },
  ],
  "servicefoxer@example.com": [
    { path: UserPath.user,         totalXP: 1800 },
    { path: UserPath.serviceFoxer, totalXP: 5200 },
  ],
  "gearfoxer@example.com": [
    { path: UserPath.user,      totalXP: 2100 },
    { path: UserPath.gearFoxer, totalXP: 7300 },
  ],
  "multirole@example.com": [
    { path: UserPath.user,         totalXP: 4500 },
    { path: UserPath.eventFoxer,   totalXP: 3200 },
    { path: UserPath.venueFoxer,   totalXP: 2800 },
    { path: UserPath.serviceFoxer, totalXP: 1900 },
  ],
  "user@example.com": [
    { path: UserPath.user, totalXP: 1200 },
  ],
  "jasmine.reyes@foxers.ph": [
    { path: UserPath.user,         totalXP: 900 },
    { path: UserPath.serviceFoxer, totalXP: 4100 },
  ],
  "marco.santos@foxers.ph": [
    { path: UserPath.user,         totalXP: 700 },
    { path: UserPath.serviceFoxer, totalXP: 2600 },
  ],
  "sarah.lim@foxers.ph": [
    { path: UserPath.user,         totalXP: 1500 },
    { path: UserPath.serviceFoxer, totalXP: 3800 },
  ],
};

// bookingId is the unique key on PassportStamp — use real booking IDs from the booking seeder
const STAMP_DATA: Record<string, { bookingId: string; eventName: string; eventDate: Date; location: string; xpEarned: number }[]> = {
  "user@example.com": [
    { bookingId: "seed-booking-may-birthday-01", eventName: "Santos Birthday Bash",            eventDate: new Date("2026-05-07"), location: "Quezon City, Philippines", xpEarned: 100 },
    { bookingId: "seed-booking-may-wedding-01",  eventName: "Garcia-Reyes Wedding Reception",  eventDate: new Date("2026-05-20"), location: "Boracay, Philippines",     xpEarned: 100 },
    { bookingId: "seed-booking-birthday-01",     eventName: "Maria's 30th Birthday",           eventDate: new Date("2026-06-10"), location: "Manila, Philippines",       xpEarned: 100 },
  ],
  "host@example.com": [
    { bookingId: "seed-booking-may-birthday-02",  eventName: "Reyes Surprise Party",     eventDate: new Date("2026-05-14"), location: "Pasig City, Philippines", xpEarned: 100 },
    { bookingId: "seed-booking-may-corporate-01", eventName: "Q3 Team Strategy Summit",  eventDate: new Date("2026-05-27"), location: "Taguig, Philippines",    xpEarned: 100 },
    { bookingId: "seed-booking-corporate-01",     eventName: "Tech Startup Demo Day",    eventDate: new Date("2026-06-20"), location: "Taguig, Philippines",    xpEarned: 100 },
  ],
};

const BADGE_GRANTS: Record<string, string[]> = {
  "mayor@example.com":  ["City Builder", "District Champion"],
  "host@example.com":   ["Host Master", "The Architect"],
  "gearfoxer@example.com": ["Trendsetter", "Social Butterfly"],
  "multirole@example.com": ["Early Adopter"],
  "user@example.com":   ["Early Adopter", "First Review"],
};

export async function seedPassports(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting passport seed...");

    for (const user of users) {
      const pathData = USER_PASSPORT_DATA[user.email];
      if (!pathData) continue;

      const passport = await prisma.passport.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
        include: { paths: true },
      });

      for (const { path, totalXP } of pathData) {
        const { level, currentXP, requiredXP } = calculateLevel(totalXP);
        await prisma.passportPath.upsert({
          where: { passportId_path: { passportId: passport.id, path } },
          create: { passportId: passport.id, path, level, currentXP, totalXP },
          update: { level, currentXP, totalXP },
        });
      }

      // Stamps
      const stamps = STAMP_DATA[user.email] ?? [];
      for (const s of stamps) {
        await prisma.passportStamp.upsert({
          where: { bookingId: s.bookingId },
          create: { passportId: passport.id, bookingId: s.bookingId, eventName: s.eventName, eventDate: s.eventDate, location: s.location, xpEarned: s.xpEarned },
          update: { eventName: s.eventName, eventDate: s.eventDate, location: s.location, xpEarned: s.xpEarned },
        });
      }

      // Badges
      const badgeNames = BADGE_GRANTS[user.email] ?? [];
      for (const name of badgeNames) {
        const badge = await prisma.badge.findUnique({ where: { name } });
        if (!badge) continue;
        await prisma.userBadge.upsert({
          where: { passportId_badgeId: { passportId: passport.id, badgeId: badge.id } },
          create: { passportId: passport.id, badgeId: badge.id },
          update: {},
        });
      }

      console.log(`✓ Passport seeded for ${user.email}`);
    }

    console.log("✅ Passport seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding passports:", error);
    throw error;
  }
}
