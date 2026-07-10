import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma";

const TEST_SECRET = process.env.ACCESS_TOKEN_SECRET || "accesssecret123";

export function createTestToken(userId: string, email = "test@test.com") {
  return jwt.sign(
    { userId, systemRole: "user", roleType: [], email },
    TEST_SECRET,
  );
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

export async function cleanupWaitlist() {
  await prisma.waitlist.deleteMany({});
}

export async function cleanupTestData(userIds: string[], templateIds: string[]) {
  // Delete in dependency order: waitlist → bookings (by event) → events → templates → users
  await prisma.waitlist.deleteMany({});
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
