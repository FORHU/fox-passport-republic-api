import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/utils/prisma";

/**
 * #264 switch-over (T6–T9, T12.1) against a real database, with the plan's
 * worked example: venue 10,000 (5% default fee) + catering 5,000 (6% rule),
 * the EventFoxer's 10% commission, 3% processing = 17,750.
 *
 * - An event request is priced by the server from the template's Foxers,
 *   never from the client's `totalAmount`, and stores the rate it used.
 * - Its transactions store each line's snapshot.
 * - Central Payment checkout charges exactly those lines; a line without a
 *   snapshot is priced with the Event's rate; vouchers are refused.
 *
 * Needs the default `event_item` rule from migration
 * 20261109130000_add_default_event_item_fee_rule. Deletes only what it creates.
 */

const sessionsCreate = vi.fn(async () => ({
  id: `cs_test_${Math.random().toString(36).slice(2)}`,
  url: "http://checkout.url",
}));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } };
    paymentIntents = { retrieve: vi.fn() };
    refunds = { create: vi.fn() };
    webhooks = { constructEvent: vi.fn() };
  },
}));

const EventRequestSvc = (
  await import("../src/modules/event-request/event-request.service")
).default;
const EventTransactionSvc = (
  await import("../src/modules/event-transaction/event-transaction.service")
).default;
const EventCheckoutSvc = (
  await import("../src/modules/payment/event-checkout.service")
).default;

describe("event payment switch-over (database)", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids = {
    foxer: "",
    client: "",
    mayor: "",
    caterer: "",
    dj: "",
    venue: "",
    catering: "",
    djService: "",
    template: "",
    event: "",
    booking: "",
    cateringRule: "",
  };

  beforeAll(async () => {
    const user = (key: string, extra: Record<string, unknown> = {}) =>
      prisma.user.create({
        data: {
          email: `switchover-${key}-${runId}@example.com`,
          name: `Switchover ${key}`,
          password: "pw",
          ...extra,
        },
      });
    ids.foxer = (
      await user("foxer", { roleType: ["eventFoxer"], commissionPct: 10 })
    ).id;
    ids.client = (await user("client", { isEmailVerified: true })).id;
    ids.mayor = (await user("mayor", { roleType: ["venueFoxer"] })).id;
    ids.caterer = (await user("caterer")).id;
    ids.dj = (await user("dj")).id;

    ids.venue = (
      await prisma.venue.create({
        data: {
          name: `Switchover Venue ${runId}`,
          description: "desc",
          category: "beach_resort",
          capacity: 100,
          price: 10000,
          billingRate: "hourly",
          address: "1 Test St",
          city: "City",
          state: "State",
          country: "Country",
          mayorId: ids.mayor,
        },
      })
    ).id;
    const service = (
      ownerId: string,
      category: "catering" | "dj",
      price: number,
    ) =>
      prisma.service.create({
        data: {
          ownerId,
          category,
          name: `Switchover ${category} ${runId}`,
          description: "desc",
          price,
          billingRate: "hourly",
          status: "available",
        },
      });
    ids.catering = (await service(ids.caterer, "catering", 5000)).id;
    ids.djService = (await service(ids.dj, "dj", 2000)).id;

    // The admin's 6% for catering; everything else takes the 5% default.
    ids.cateringRule = (
      await prisma.platformFeeConfig.create({
        data: {
          name: `Switchover catering ${runId}`,
          transactionType: "event_item",
          category: "service",
          subcategory: "catering",
          percentage: 6,
        },
      })
    ).id;

    ids.template = (
      await prisma.eventTemplate.create({
        data: {
          ownerId: ids.foxer,
          name: `Switchover template ${runId}`,
          description: "desc",
          category: "corporate",
          templateServices: {
            // An EventFoxer-set price that must be ignored (C6).
            create: [{ serviceId: ids.catering, agreedPrice: 1 }],
          },
          templateVenues: { create: [{ venueId: ids.venue, agreedPrice: 1 }] },
        },
      })
    ).id;
  });

  afterAll(async () => {
    const eventId = ids.event;
    if (eventId) {
      await prisma.checkout.deleteMany({
        where: { invoice: { payerId: ids.client } },
      });
      await prisma.invoice.deleteMany({ where: { payerId: ids.client } });
      await prisma.eventServiceTransaction.deleteMany({ where: { eventId } });
      await prisma.eventVenueTransaction.deleteMany({ where: { eventId } });
      await prisma.booking.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    await prisma.eventTemplate.deleteMany({ where: { id: ids.template } });
    await prisma.platformFeeConfig.deleteMany({
      where: { id: ids.cateringRule },
    });
    await prisma.service.deleteMany({
      where: { id: { in: [ids.catering, ids.djService] } },
    });
    await prisma.venue.deleteMany({ where: { id: ids.venue } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [ids.foxer, ids.client, ids.mayor, ids.caterer, ids.dj] },
      },
    });
  });

  it("prices an event request from the template, not the client's totalAmount, and stores the rate", async () => {
    const event = await EventRequestSvc.spawnRequestFromTemplate({
      clientId: ids.client,
      templateId: ids.template,
      name: "Switchover event",
      description: "desc",
      startAt: new Date("2027-09-01T10:00:00Z"),
      endAt: new Date("2027-09-01T22:00:00Z"),
      guestCount: 50,
      totalAmount: 1, // a client's own figure: ignored
    });
    ids.event = event.id;

    expect({
      itemsTotal: event.itemsTotal.toNumber(),
      hostMarkupAmount: event.hostMarkupAmount.toNumber(),
      platformFeeAmount: event.platformFeeAmount.toNumber(),
      processingFeeAmount: event.processingFeeAmount.toNumber(),
      totalAmount: event.totalAmount.toNumber(),
      commissionPct: event.commissionPct?.toNumber(),
    }).toEqual({
      itemsTotal: 15000,
      hostMarkupAmount: 1500,
      platformFeeAmount: 800,
      processingFeeAmount: 450,
      totalAmount: 17750,
      commissionPct: 10,
    });
  });

  it("stores each line's snapshot on its transaction, priced with the Event's rate", async () => {
    // Changing the EventFoxer's rate now must not move this Event (D6).
    await prisma.user.update({
      where: { id: ids.foxer },
      data: { commissionPct: 50 },
    });
    ids.booking = (
      await prisma.booking.create({
        data: {
          eventId: ids.event,
          userId: ids.client,
          guestCount: 50,
          totalAmount: 17750,
          status: "pending",
          startAt: new Date("2027-09-01T10:00:00Z"),
          endAt: new Date("2027-09-01T22:00:00Z"),
        },
      })
    ).id;
    await EventTransactionSvc.createTransactionsFromTemplate(
      ids.event,
      ids.booking,
    );

    const catering = await prisma.eventServiceTransaction.findFirstOrThrow({
      where: { eventId: ids.event, serviceId: ids.catering },
    });
    expect({
      agreedPrice: catering.agreedPrice.toNumber(),
      category: catering.category,
      commissionPct: catering.commissionPct?.toNumber(),
      commissionAmount: catering.commissionAmount?.toNumber(),
      platformFeePct: catering.platformFeePct?.toNumber(),
      platformFeeAmount: catering.platformFeeAmount?.toNumber(),
      processingFeeAmount: catering.processingFeeAmount?.toNumber(),
    }).toEqual({
      agreedPrice: 5000,
      category: "catering",
      commissionPct: 10,
      commissionAmount: 500,
      platformFeePct: 6,
      platformFeeAmount: 300,
      processingFeeAmount: 150,
    });

    const venue = await prisma.eventVenueTransaction.findFirstOrThrow({
      where: { eventId: ids.event, venueId: ids.venue },
    });
    expect(venue.agreedPrice.toNumber()).toBe(10000);
    expect(venue.platformFeeAmount?.toNumber()).toBe(500);
  });

  it("shows the client every line and the total at checkout", async () => {
    const summary = await EventCheckoutSvc.getPaymentSummary(
      ids.event,
      ids.client,
    );
    expect(summary).toMatchObject({
      subtotalAmount: 15000,
      commissionAmount: 1500,
      platformFeeAmount: 800,
      processingFeeAmount: 450,
      discountAmount: 0,
      grossAmount: 17750,
    });
    expect(summary.items).toHaveLength(2);
  });

  it("never charges an item the client left out of the package", async () => {
    // Excluded (`included: false`), so it must not appear or be charged.
    const excluded = await prisma.eventServiceTransaction.create({
      data: {
        eventId: ids.event,
        bookingId: ids.booking,
        serviceId: ids.djService,
        providerId: ids.dj,
        agreedPrice: 999,
        status: "pending",
        included: false,
      },
    });
    const summary = await EventCheckoutSvc.getPaymentSummary(
      ids.event,
      ids.client,
    );
    expect(summary.grossAmount).toBe(17750);
    expect(summary.items).toHaveLength(2);
    await prisma.eventServiceTransaction.delete({ where: { id: excluded.id } });
  });

  it("refuses vouchers on a new-pricing Event", async () => {
    await expect(
      EventCheckoutSvc.getPaymentSummary(ids.event, ids.client, ["ANYCODE"]),
    ).rejects.toMatchObject({
      status: 400,
      code: "VOUCHERS_NOT_OFFERED_ON_EVENTS",
    });
  });

  it("prices a line with no snapshot using the Event's own rate", async () => {
    // An item added to the booking without a snapshot (5% default fee, 10%).
    await prisma.eventServiceTransaction.create({
      data: {
        eventId: ids.event,
        bookingId: ids.booking,
        serviceId: ids.djService,
        providerId: ids.dj,
        agreedPrice: 2000,
        status: "pending",
      },
    });
    const summary = await EventCheckoutSvc.getPaymentSummary(
      ids.event,
      ids.client,
    );
    // 17,750 + 2,000 + 200 + 100 + 60.
    expect(summary.grossAmount).toBe(20110);
    expect(summary.commissionAmount).toBe(1700);
  });

  it("charges exactly the summary's total, with every part recorded on the invoice", async () => {
    sessionsCreate.mockClear();
    const { invoice } = await EventCheckoutSvc.createEventCheckout(
      ids.event,
      ids.client,
    );

    expect(invoice.grossAmount.toNumber()).toBe(20110);
    expect(invoice.subtotalAmount.toNumber()).toBe(17000);
    expect(invoice.platformFeeAmount.toNumber()).toBe(900);
    expect(invoice.platformFeeSnapshot).toMatchObject({
      kind: "event_breakdown",
      commissionTotal: 1700,
      platformFee: 900,
      processingFee: 510,
      total: 20110,
    });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});
