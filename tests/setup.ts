import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma";
import { RoleType, SystemRole } from "@prisma/client";

/**
 * This file is imported only by the specs that *write* to the database, and
 * those specs delete what they seed. On 8 Sep they deleted it from the
 * development database - 148 users, 128 venues, and everything else - because
 * that is the database `.env` points at, and nothing said otherwise.
 *
 * Nothing here can tell a seeded row from a real one, so the fix is upstream:
 * seeding is refused unless the target database is named as a test database.
 * Create one with:
 *
 *   docker exec local_postgres psql -U admin -d postgres  *     -c "CREATE DATABASE foxpassportrepublic_test"
 *   cp .env.test.example .env.test.local     # then set the password
 *   DATABASE_URL=<that url> npx prisma migrate deploy
 *
 * The specs that only read are unaffected: they never import this file.
 */
const databaseName = (process.env.DATABASE_URL ?? "").split("/").pop() ?? "";

if (!databaseName.replace(/\?.*$/, "").endsWith("_test")) {
  throw new Error(
    `Refusing to seed: DATABASE_URL points at "${databaseName || "nothing"}", ` +
      "which is not a test database. These specs delete what they create and " +
      "cannot tell your data from theirs. See tests/setup.ts for how to make " +
      "one, or run with --exclude to skip the specs that seed.",
  );
}

const TEST_SECRET = process.env.ACCESS_TOKEN_SECRET || "accesssecret123";

export function createTestToken(
  userId: string,
  email = "test@test.com",
  roleType: RoleType[] = [],
  systemRole: SystemRole = "user",
) {
  return jwt.sign({ userId, systemRole, roleType, email }, TEST_SECRET);
}

export async function seedTestUser(email = "waitlist-test@test.com") {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email,
      password: "hashedpassword",
      name: "Waitlist Tester",
    },
  });
}

export async function seedTestTemplate(
  ownerId: string,
  maxAttendees: number | null = 2,
) {
  return prisma.eventTemplate.create({
    data: {
      ownerId,
      name: "Waitlist Test Event",
      description: "A test event for waitlist tests",
      category: "social",
      isPublic: true,
      maxAttendees,
    },
  });
}

export async function seedTestEvent(templateId: string, clientId: string) {
  return prisma.event.create({
    data: {
      templateId,
      clientId,
      organizerId: clientId,
      name: "Waitlist Test Event Instance",
      description: "Test event instance",
      eventCategory: "social",
      eventStatus: "pending",
      requestStatus: "approved",
      guestCount: 2,
      totalAmount: 100,
      itemsTotal: 95,
      hostMarkupAmount: 0,
      platformFeeAmount: 5,
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000),
    },
  });
}

export async function seedTestBooking(
  eventId: string,
  userId: string,
  guestCount = 2,
) {
  return prisma.booking.create({
    data: {
      eventId,
      userId,
      guestCount,
      totalAmount: 100,
      status: "confirmed",
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000),
    },
  });
}

export async function cleanupTestData(
  userIds: string[],
  templateIds: string[],
) {
  // Delete in dependency order: waitlist → bookings (by event) → events →
  // templates → users. Scoped to the templates this run created: it used to be
  // `deleteMany({})`, which empties the table for everyone.
  if (templateIds.length > 0) {
    await prisma.waitlist.deleteMany({
      where: { templateId: { in: templateIds } },
    });
  }
  if (templateIds.length > 0) {
    const events = await prisma.event.findMany({
      where: { templateId: { in: templateIds } },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      await prisma.booking.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
  }
  await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.eventTemplate.deleteMany({
    where: { id: { in: templateIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
}
