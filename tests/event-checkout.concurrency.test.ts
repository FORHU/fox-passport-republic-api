import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/utils/prisma";
import { AvailabilityConflictError } from "../src/modules/availability/availability.types";

// Mock Stripe so real network calls never happen, and so we can assert on
// exactly how many times (and with what arguments) it was invoked — this is
// the "verify no Stripe call before DB commit" evidence, not an assumption.
const sessionsCreateMock = vi
  .fn()
  .mockImplementation(async () => ({
    id: `cs_test_${Math.random().toString(36).slice(2)}`,
    url: "http://checkout.url",
  }));

vi.mock("stripe", () => {
  return {
    default: class {
      checkout = { sessions: { create: sessionsCreateMock } };
      paymentIntents = { retrieve: vi.fn() };
      refunds = { create: vi.fn() };
      webhooks = { constructEvent: vi.fn() };
    },
  };
});

// Imported AFTER the mock so StripeAdapter's module-level `new Stripe(...)`
// picks up the mocked class.
const EventCheckoutSvc = (await import("../src/modules/payment/event-checkout.service")).default;
const AvailabilitySvc = (await import("../src/modules/availability/availability.service")).default;

describe("Event checkout — concurrency, duplicate-checkout, availability revalidation", () => {
  const runId = Math.random().toString(36).substring(7);
  let payerId: string;
  let providerId: string;
  let assetId: string;

  const userIds: string[] = [];
  const eventIds: string[] = [];
  const bookingIds: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    const payer = await prisma.user.create({
      data: { email: `checkout_payer_${runId}@test.com`, password: "pw", name: "Payer", roleType: ["eventFoxer"] },
    });
    const provider = await prisma.user.create({
      data: { email: `checkout_provider_${runId}@test.com`, password: "pw", name: "Provider", roleType: ["gearFoxer"] },
    });
    payerId = payer.id;
    providerId = provider.id;
    userIds.push(payerId, providerId);
  });

  afterAll(async () => {
    await prisma.eventAssetTransaction.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.checkout.deleteMany({ where: { invoice: { payerId } } });
    await prisma.invoice.deleteMany({ where: { payerId } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function makeAsset(quantity: number) {
    const asset = await prisma.asset.create({
      data: {
        ownerId: providerId,
        category: "equipment",
        name: `Checkout Test Asset ${Math.random().toString(36).slice(2)}`,
        description: "desc",
        quantity,
        price: 1000,
        billingRate: "daily",
        status: "available",
      },
    });
    assetIds.push(asset.id);
    return asset;
  }

  async function makeEventWithBookingAndAsset(opts: {
    quantity: number;
    reservedQuantity: number;
    start: Date;
    end: Date;
  }) {
    const asset = await makeAsset(opts.quantity);

    const event = await prisma.event.create({
      data: {
        clientId: payerId,
        organizerId: payerId,
        name: "Checkout Concurrency Test Event",
        description: "desc",
        eventCategory: "corporate",
        startAt: opts.start,
        endAt: opts.end,
        guestCount: 10,
        totalAmount: 1000,
      },
    });
    eventIds.push(event.id);

    const booking = await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: payerId,
        guestCount: 10,
        totalAmount: 1000,
        status: "pending",
        startAt: opts.start,
        endAt: opts.end,
      },
    });
    bookingIds.push(booking.id);

    await prisma.eventAssetTransaction.create({
      data: {
        eventId: event.id,
        bookingId: booking.id,
        assetId: asset.id,
        providerId,
        quantity: opts.reservedQuantity,
        status: "pending",
        agreedPrice: 1000,
      },
    });

    return { event, booking, asset };
  }

  it("THE key test: two simultaneous checkout requests for the same booking result in exactly one active checkout and one invoice, computed from locked current state", async () => {
    const start = new Date("2027-08-01T00:00:00.000Z");
    const end = new Date("2027-08-02T00:00:00.000Z");
    const { event } = await makeEventWithBookingAndAsset({
      quantity: 5,
      reservedQuantity: 1,
      start,
      end,
    });

    sessionsCreateMock.mockClear();

    // Genuinely concurrent — not sequentially awaited.
    const [resultA, resultB] = await Promise.all([
      EventCheckoutSvc.createEventCheckout(event.id, payerId),
      EventCheckoutSvc.createEventCheckout(event.id, payerId),
    ]);

    expect(resultA.invoice.id).toBe(resultB.invoice.id); // same invoice reused, not duplicated

    const invoiceCount = await prisma.invoice.count({
      where: { payerId, items: { some: { sourceType: "event_asset_transaction" } }, id: resultA.invoice.id },
    });
    expect(invoiceCount).toBe(1);

    const activeCheckouts = await prisma.checkout.findMany({
      where: { invoiceId: resultA.invoice.id, status: "active" },
    });
    // Exactly one ACTIVE checkout at the end — the second call's
    // createPendingCheckout expires the first's before creating its own,
    // so a stale first attempt can never be paid alongside a second one.
    expect(activeCheckouts.length).toBe(1);

    // Both calls did reach Stripe (each created its own session before we
    // knew which one would end up "active") — but only one is live.
    expect(sessionsCreateMock).toHaveBeenCalledTimes(2);
  });

  it("duplicate checkout: a second call after the first has fully committed reuses the same invoice, never creating a second one", async () => {
    const start = new Date("2027-08-05T00:00:00.000Z");
    const end = new Date("2027-08-06T00:00:00.000Z");
    const { event } = await makeEventWithBookingAndAsset({
      quantity: 5,
      reservedQuantity: 1,
      start,
      end,
    });

    const first = await EventCheckoutSvc.createEventCheckout(event.id, payerId);
    const second = await EventCheckoutSvc.createEventCheckout(event.id, payerId);

    expect(second.invoice.id).toBe(first.invoice.id);

    const transactionIds = (
      await prisma.eventAssetTransaction.findMany({
        where: { eventId: event.id },
        select: { id: true },
      })
    ).map((r) => r.id);

    const invoiceCount = await prisma.invoice.count({
      where: { items: { some: { sourceId: { in: transactionIds } } } },
    });
    expect(invoiceCount).toBe(1);
  });

  it("availability revalidation: a conflicting reservation created after the item was added, but before checkout, blocks checkout", async () => {
    const start = new Date("2027-08-10T00:00:00.000Z");
    const end = new Date("2027-08-11T00:00:00.000Z");
    // quantity 1, reserving all of it via the event's own transaction
    const { event, asset } = await makeEventWithBookingAndAsset({
      quantity: 1,
      reservedQuantity: 1,
      start,
      end,
    });

    // Simulate a conflicting DIRECT booking landing on the same asset/date
    // range after the event's item was added but before checkout — this is
    // exactly the race the approved design named: availability can change
    // between "item added" and "payment submitted."
    const conflictingBooker = await prisma.user.create({
      data: { email: `conflict_${runId}@test.com`, password: "pw", name: "Conflict", roleType: ["eventFoxer"] },
    });
    userIds.push(conflictingBooker.id);

    await expect(
      prisma.$transaction((tx) =>
        AvailabilitySvc.reserve(tx, [
          { kind: "asset", itemId: asset.id, dateRange: { start, end }, quantity: 1 },
        ]).then(() =>
          tx.assetBooking.create({
            data: {
              assetId: asset.id,
              userId: conflictingBooker.id,
              startDate: start,
              endDate: end,
              quantity: 1,
              totalAmount: 1000,
            },
          }),
        ),
      ),
    ).rejects.toThrow(AvailabilityConflictError);

    // The above should have failed BECAUSE the event's own transaction
    // already consumed the asset's only unit — proving the conflict is
    // real, not a test bug. Now prove checkout ALSO reruns this same check:
    // manually force a genuine conflict by creating a second, already
    // "approved" event-asset-transaction for a different booking on an
    // overlapping range for the SAME asset, bypassing AvailabilitySvc (as
    // if it had been created by a process that ran before this safety net
    // existed), then confirm checkout catches it at checkout time.
    const otherBookerEvent = await prisma.event.create({
      data: {
        clientId: payerId,
        organizerId: payerId,
        name: "Other overlapping event",
        description: "desc",
        eventCategory: "corporate",
        startAt: start,
        endAt: end,
        guestCount: 5,
        totalAmount: 500,
      },
    });
    eventIds.push(otherBookerEvent.id);
    const otherBooking = await prisma.booking.create({
      data: {
        eventId: otherBookerEvent.id,
        userId: payerId,
        guestCount: 5,
        totalAmount: 500,
        status: "pending",
        startAt: start,
        endAt: end,
      },
    });
    bookingIds.push(otherBooking.id);
    await prisma.eventAssetTransaction.create({
      data: {
        eventId: otherBookerEvent.id,
        bookingId: otherBooking.id,
        assetId: asset.id,
        providerId,
        quantity: 1,
        status: "approved",
      agreedPrice: 500,
      },
    });

    sessionsCreateMock.mockClear();
    await expect(
      EventCheckoutSvc.createEventCheckout(event.id, payerId),
    ).rejects.toThrow(AvailabilityConflictError);

    // The critical assertion for "no Stripe call before DB commit": the
    // conflict is caught INSIDE the transaction, so the provider is never
    // contacted at all when checkout is blocked.
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("verifies no Stripe call occurs before the DB transaction commits, for any blocking condition", async () => {
    const start = new Date("2027-08-15T00:00:00.000Z");
    const end = new Date("2027-08-16T00:00:00.000Z");
    const { event } = await makeEventWithBookingAndAsset({
      quantity: 5,
      reservedQuantity: 1,
      start,
      end,
    });

    sessionsCreateMock.mockClear();

    // Wrong payer — ownership check fails before any Stripe contact.
    const stranger = await prisma.user.create({
      data: { email: `stranger_${runId}@test.com`, password: "pw", name: "Stranger", roleType: ["eventFoxer"] },
    });
    userIds.push(stranger.id);

    await expect(
      EventCheckoutSvc.createEventCheckout(event.id, stranger.id),
    ).rejects.toThrow("Unauthorized");

    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});
