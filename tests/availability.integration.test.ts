import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import AvailabilitySvc from "../src/modules/availability/availability.service";
import { AvailabilityConflictError } from "../src/modules/availability/availability.types";

describe("AvailabilitySvc — locking and cross-flow conflict detection", () => {
  const runId = Math.random().toString(36).substring(7);
  let ownerId: string;
  let customerId: string;
  let asset1Id: string; // quantity 1, for the last-unit race
  let eventId: string;
  const start = new Date("2027-06-01T00:00:00.000Z");
  const end = new Date("2027-06-02T00:00:00.000Z");

  const userIds: string[] = [];
  const assetIds: string[] = [];
  const eventIds: string[] = [];
  const eatIds: string[] = [];
  const abIds: string[] = [];

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `avail_owner_${runId}@test.com`, password: "pw", name: "Owner", roleType: ["gearFoxer"] },
    });
    const customer = await prisma.user.create({
      data: { email: `avail_customer_${runId}@test.com`, password: "pw", name: "Customer", roleType: ["eventFoxer"] },
    });
    ownerId = owner.id;
    customerId = customer.id;
    userIds.push(ownerId, customerId);

    const asset = await prisma.asset.create({
      data: {
        ownerId,
        category: "equipment",
        name: "Last Unit Tent",
        description: "desc",
        quantity: 1,
        price: 1000,
        billingRate: "daily",
        status: "available",
      },
    });
    asset1Id = asset.id;
    assetIds.push(asset1Id);

    const event = await prisma.event.create({
      data: {
        clientId: customerId,
        organizerId: customerId,
        name: "Avail Test Event",
        description: "desc",
        eventCategory: "corporate",
        startAt: start,
        endAt: end,
        guestCount: 10,
        totalAmount: 1000,
      },
    });
    eventId = event.id;
    eventIds.push(eventId);
  });

  afterAll(async () => {
    await prisma.eventAssetTransaction.deleteMany({ where: { id: { in: eatIds } } });
    await prisma.assetBooking.deleteMany({ where: { id: { in: abIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("reserves successfully when there is room", async () => {
    const result = await prisma.$transaction(async (tx) => {
      await AvailabilitySvc.reserve(tx, [
        { kind: "asset", itemId: asset1Id, dateRange: { start, end }, quantity: 1 },
      ]);
      const row = await tx.eventAssetTransaction.create({
        data: {
          eventId,
          assetId: asset1Id,
          providerId: ownerId,
          quantity: 1,
          status: "pending",
          agreedPrice: 1000,
        },
      });
      return row;
    });
    eatIds.push(result.id);
    expect(result).toBeDefined();
  });

  it("rejects a second reservation for the same fully-consumed asset and date range, and rolls back cleanly", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await AvailabilitySvc.reserve(tx, [
          { kind: "asset", itemId: asset1Id, dateRange: { start, end }, quantity: 1 },
        ]);
        // Should never be reached.
        return tx.eventAssetTransaction.create({
          data: {
            eventId,
            assetId: asset1Id,
            providerId: ownerId,
            quantity: 1,
            status: "pending",
            agreedPrice: 1000,
          },
        });
      }),
    ).rejects.toThrow(AvailabilityConflictError);

    // Prove the rollback actually happened: still exactly one active row for this asset/date range.
    const count = await prisma.eventAssetTransaction.count({
      where: { assetId: asset1Id, status: { in: ["pending", "approved", "pending_provider_confirmation"] } },
    });
    expect(count).toBe(1);
  });

  it("detects a cross-flow conflict: a direct AssetBooking blocks a template/marketplace reservation for the same asset and overlapping dates", async () => {
    const directBooking = await prisma.assetBooking.create({
      data: {
        assetId: asset1Id,
        userId: customerId,
        startDate: start,
        endDate: end,
        quantity: 1,
        totalAmount: 1000,
      },
    });
    abIds.push(directBooking.id);

    // Free up the earlier template reservation from the first test so this
    // test isolates the cross-flow conflict specifically.
    await prisma.eventAssetTransaction.updateMany({
      where: { id: { in: eatIds } },
      data: { status: "cancelled" },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await AvailabilitySvc.reserve(tx, [
          { kind: "asset", itemId: asset1Id, dateRange: { start, end }, quantity: 1 },
        ]);
      }),
    ).rejects.toThrow(AvailabilityConflictError);
  });

  it("validateForCheckout excludes the booking's own existing reservation from the conflict count", async () => {
    const booking = await prisma.booking.create({
      data: {
        eventId,
        userId: customerId,
        guestCount: 10,
        totalAmount: 1000,
        status: "pending",
        startAt: start,
        endAt: end,
      },
    });

    // Clear the direct booking from the previous test so this test isolates
    // the self-exclusion behavior.
    await prisma.assetBooking.updateMany({ where: { id: { in: abIds } }, data: { status: "cancelled" } });

    const owned = await prisma.eventAssetTransaction.create({
      data: {
        eventId,
        bookingId: booking.id,
        assetId: asset1Id,
        providerId: ownerId,
        quantity: 1,
        status: "approved",
        agreedPrice: 1000,
      },
    });
    eatIds.push(owned.id);

    // Must NOT throw — the only active reservation for this asset/date range
    // belongs to this same booking.
    await expect(
      prisma.$transaction(async (tx) => {
        await AvailabilitySvc.validateForCheckout(tx, booking.id, [
          { kind: "asset", itemId: asset1Id, dateRange: { start, end }, quantity: 1 },
        ]);
      }),
    ).resolves.not.toThrow();

    await prisma.booking.delete({ where: { id: booking.id } });
  });
});
