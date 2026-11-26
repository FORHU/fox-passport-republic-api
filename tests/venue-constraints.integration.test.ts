import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import UsersSvc from "../src/modules/users/users.service";
import VenueSvc from "../src/modules/venue/venue.service";

/** The database backs the venue rule (epic api#477, api#482). */
describe("venue rule constraints", () => {
  const run = Math.random().toString(36).slice(2, 8);
  let owner = "";
  let guest = "";
  let free = "";
  let venue = "";
  let template = "";
  let booking = "";
  let stamp = "";

  const makeUser = async (tag: string) =>
    (
      await prisma.user.create({
        data: {
          email: `venue-constraint-${tag}-${run}@test.com`,
          username: `venue_constraint_${tag}_${run}`,
          password: "pw",
          name: `Constraint ${tag}`,
          roleType: ["venueFoxer"],
        },
      })
    ).id;

  const makeVenue = async (mayorId: string, name: string) =>
    (
      await prisma.venue.create({
        data: {
          mayorId,
          category: "indoor",
          name: `${name} ${run}`,
          description: "A hall",
          capacity: 100,
          price: 1000,
          billingRate: "daily",
          address: "1 Test Street",
          city: "Manila",
          country: "Philippines",
          status: "available",
        },
      })
    ).id;

  beforeAll(async () => {
    owner = await makeUser("owner");
    guest = await makeUser("guest");
    free = await makeUser("free");
    venue = await makeVenue(owner, "Constraint Hall");
    await makeVenue(free, "Unused Hall");

    template = (
      await prisma.eventTemplate.create({
        data: {
          ownerId: guest,
          name: `Constraint package ${run}`,
          description: "A package",
          category: "social",
        },
      })
    ).id;
    await prisma.eventTemplateVenue.create({
      data: { templateId: template, venueId: venue },
    });

    const startAt = new Date(Date.now() - 2 * 86_400_000);
    const endAt = new Date(startAt.getTime() + 3_600_000);
    const event = await prisma.event.create({
      data: {
        clientId: guest,
        organizerId: guest,
        name: "Constraint night",
        description: "A night",
        eventCategory: "social",
        startAt,
        endAt,
        guestCount: 2,
        totalAmount: 1000,
      },
    });
    booking = (
      await prisma.booking.create({
        data: {
          eventId: event.id,
          userId: guest,
          guestCount: 2,
          totalAmount: 1000,
          status: "completed",
          startAt,
          endAt,
          ticketCode: `CONS-${run}`,
        },
      })
    ).id;
    const passport = await prisma.passport.upsert({
      where: { userId: guest },
      create: { userId: guest },
      update: {},
    });
    stamp = (
      await prisma.passportStamp.create({
        data: {
          passportId: passport.id,
          bookingId: booking,
          eventName: "Constraint night",
          eventDate: startAt,
          venueId: venue,
          xpEarned: 0,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.passportStamp.deleteMany({ where: { bookingId: booking } });
    await prisma.booking.deleteMany({ where: { id: booking } });
    await prisma.event.deleteMany({ where: { clientId: guest } });
    await prisma.eventTemplate.deleteMany({ where: { id: template } });
    await prisma.passport.deleteMany({ where: { userId: guest } });
    await prisma.venue.deleteMany({
      where: { mayorId: { in: [owner, free] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner, guest, free] } },
    });
  });

  it("a stamp's venue can't be null", async () => {
    await expect(
      prisma.$executeRaw`UPDATE passport_stamps SET "venueId" = NULL WHERE id = ${stamp}`,
    ).rejects.toThrow();
  });

  it("a venue in a package or a stamp can't be deleted", async () => {
    await expect(
      prisma.venue.delete({ where: { id: venue } }),
    ).rejects.toMatchObject({ code: "P2003" });

    const still = await prisma.passportStamp.findUnique({
      where: { id: stamp },
    });
    expect(still?.venueId).toBe(venue);
  });

  it("an owner whose venue is in use can't be deleted, and nothing changes", async () => {
    await expect(VenueSvc.assertOwnerDeletable(owner)).rejects.toMatchObject({
      status: 409,
      code: "VENUE_IN_USE",
    });
    await expect(UsersSvc.deleteUser(owner)).rejects.toMatchObject({
      code: "VENUE_IN_USE",
    });
    expect(
      await prisma.user.findUnique({ where: { id: owner } }),
    ).not.toBeNull();
    expect(
      await prisma.venue.findUnique({ where: { id: venue } }),
    ).not.toBeNull();
  });

  it("an owner whose venues nothing uses can be deleted", async () => {
    await expect(VenueSvc.assertOwnerDeletable(free)).resolves.toBeUndefined();
  });
});
