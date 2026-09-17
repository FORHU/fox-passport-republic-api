import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import BookingSvc, { BookingError } from "../src/modules/booking/booking.service";
import TransactionStatusSvc from "../src/modules/transaction-status/transaction-status.service";

describe("BookingSvc.addAdHocItem — ad-hoc marketplace item add, authorization, idempotency", () => {
  const runId = Math.random().toString(36).substring(7);
  let ownerId: string;
  let providerId: string;
  let strangerId: string;

  const userIds: string[] = [];
  const eventIds: string[] = [];
  const bookingIds: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `adhoc_owner_${runId}@test.com`, password: "pw", name: "Owner", roleType: ["eventFoxer"] },
    });
    const provider = await prisma.user.create({
      data: { email: `adhoc_provider_${runId}@test.com`, password: "pw", name: "Provider", roleType: ["gearFoxer"] },
    });
    const stranger = await prisma.user.create({
      data: { email: `adhoc_stranger_${runId}@test.com`, password: "pw", name: "Stranger", roleType: ["eventFoxer"] },
    });
    ownerId = owner.id;
    providerId = provider.id;
    strangerId = stranger.id;
    userIds.push(ownerId, providerId, strangerId);
  });

  afterAll(async () => {
    await prisma.eventAssetTransaction.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$executeRaw`DELETE FROM request_idempotency_keys WHERE endpoint = 'POST /bookings/:id/items'`;
  });

  async function makeBooking(opts: { status?: "pending" | "cancelled"; expiresAt?: Date } = {}) {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        clientId: ownerId,
        organizerId: ownerId,
        name: "Ad-hoc item test event",
        description: "desc",
        eventCategory: "corporate",
        startAt: start,
        endAt: end,
        guestCount: 10,
        totalAmount: 0,
      },
    });
    eventIds.push(event.id);
    const booking = await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: ownerId,
        guestCount: 10,
        totalAmount: 0,
        status: opts.status ?? "pending",
        startAt: start,
        endAt: end,
        expiresAt: opts.expiresAt,
      },
    });
    bookingIds.push(booking.id);
    return { event, booking };
  }

  async function makeAsset(quantity = 5) {
    const asset = await prisma.asset.create({
      data: {
        ownerId: providerId,
        category: "equipment",
        name: `Ad-hoc test asset ${Math.random().toString(36).slice(2)}`,
        description: "desc",
        quantity,
        price: 200,
        billingRate: "daily",
        status: "available",
      },
    });
    assetIds.push(asset.id);
    return asset;
  }

  it("adds an ad-hoc asset item, starting at pending_provider_confirmation with a deadline set", async () => {
    const { booking } = await makeBooking();
    const asset = await makeAsset();

    const result: any = await BookingSvc.addAdHocItem({
      bookingId: booking.id,
      userId: ownerId,
      kind: "asset",
      itemId: asset.id,
      quantity: 1,
      idempotencyKey: `key-${Math.random()}`,
    });

    expect(result.status).toBe("pending_provider_confirmation");
    expect(result.confirmationDeadline).not.toBeNull();
    expect(result.providerId).toBe(providerId);
  });

  it("rejects a non-owner", async () => {
    const { booking } = await makeBooking();
    const asset = await makeAsset();

    await expect(
      BookingSvc.addAdHocItem({
        bookingId: booking.id,
        userId: strangerId,
        kind: "asset",
        itemId: asset.id,
        idempotencyKey: `key-${Math.random()}`,
      }),
    ).rejects.toThrow(BookingError);
  });

  it("rejects adding to a non-pending booking", async () => {
    const { booking } = await makeBooking({ status: "cancelled" });
    const asset = await makeAsset();

    await expect(
      BookingSvc.addAdHocItem({
        bookingId: booking.id,
        userId: ownerId,
        kind: "asset",
        itemId: asset.id,
        idempotencyKey: `key-${Math.random()}`,
      }),
    ).rejects.toThrow(/still pending payment/);
  });

  it("rejects adding to an expired booking", async () => {
    const { booking } = await makeBooking({ expiresAt: new Date(Date.now() - 60000) });
    const asset = await makeAsset();

    await expect(
      BookingSvc.addAdHocItem({
        bookingId: booking.id,
        userId: ownerId,
        kind: "asset",
        itemId: asset.id,
        idempotencyKey: `key-${Math.random()}`,
      }),
    ).rejects.toThrow(/expired/);
  });

  it("blocks on an availability conflict with a clear error code", async () => {
    const { booking } = await makeBooking();
    const asset = await makeAsset(1); // only 1 unit

    await BookingSvc.addAdHocItem({
      bookingId: booking.id,
      userId: ownerId,
      kind: "asset",
      itemId: asset.id,
      quantity: 1,
      idempotencyKey: `key-a-${Math.random()}`,
    });

    // Same booking, same asset, no more units — the partial unique index
    // would also block a second active row for this (booking, asset) pair,
    // but this specifically exercises the AvailabilityConflictError path.
    const { booking: otherBooking } = await makeBooking();
    await expect(
      BookingSvc.addAdHocItem({
        bookingId: otherBooking.id,
        userId: ownerId,
        kind: "asset",
        itemId: asset.id,
        quantity: 1,
        idempotencyKey: `key-b-${Math.random()}`,
      }),
    ).rejects.toMatchObject({ code: "AVAILABILITY_CONFLICT" });
  });

  it("idempotency: same key + same payload returns the same row, does not create a duplicate", async () => {
    const { booking } = await makeBooking();
    const asset = await makeAsset();
    const key = `idempotent-${Math.random()}`;

    const first: any = await BookingSvc.addAdHocItem({
      bookingId: booking.id,
      userId: ownerId,
      kind: "asset",
      itemId: asset.id,
      quantity: 1,
      idempotencyKey: key,
    });
    const second: any = await BookingSvc.addAdHocItem({
      bookingId: booking.id,
      userId: ownerId,
      kind: "asset",
      itemId: asset.id,
      quantity: 1,
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);

    const count = await prisma.eventAssetTransaction.count({
      where: { bookingId: booking.id, assetId: asset.id },
    });
    expect(count).toBe(1);
  });

  it("end-to-end: add -> provider confirms -> status becomes approved; add -> provider rejects -> rejected with reason", async () => {
    const { booking: bookingA } = await makeBooking();
    const assetA = await makeAsset();
    const rowA: any = await BookingSvc.addAdHocItem({
      bookingId: bookingA.id,
      userId: ownerId,
      kind: "asset",
      itemId: assetA.id,
      quantity: 1,
      idempotencyKey: `confirm-${Math.random()}`,
    });
    const confirmed = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: rowA.id, kind: "asset", action: "confirm", actorId: providerId }),
    );
    expect((confirmed as any).status).toBe("approved");

    const { booking: bookingB } = await makeBooking();
    const assetB = await makeAsset();
    const rowB: any = await BookingSvc.addAdHocItem({
      bookingId: bookingB.id,
      userId: ownerId,
      kind: "asset",
      itemId: assetB.id,
      quantity: 1,
      idempotencyKey: `reject-${Math.random()}`,
    });
    const rejected = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: rowB.id, kind: "asset", action: "reject", actorId: providerId }),
    );
    expect((rejected as any).status).toBe("rejected");
    expect((rejected as any).rejectionReason).toBe("provider_declined");

    // Customer removes/cancels the rejected item's row is not applicable —
    // rejected is terminal — but the customer CAN cancel a still-unconfirmed
    // item they've decided against.
    const { booking: bookingC } = await makeBooking();
    const assetC = await makeAsset();
    const rowC: any = await BookingSvc.addAdHocItem({
      bookingId: bookingC.id,
      userId: ownerId,
      kind: "asset",
      itemId: assetC.id,
      quantity: 1,
      idempotencyKey: `cancel-${Math.random()}`,
    });
    const cancelled = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: rowC.id, kind: "asset", action: "cancel", actorId: ownerId }),
    );
    expect((cancelled as any).status).toBe("cancelled");
  });
});
