import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import { only } from "./helpers/cleanup";

/**
 * #264 T15 against a real database: the gaps the per-task tests left.
 *
 * - The EventFoxer changes their rate after an Event is created but before its
 *   lines are priced: every line keeps the Event's stored rate, and the next
 *   Event gets the new one.
 * - Payouts: each Foxer gets their stored price, the EventFoxer gets the
 *   commission total, and the FoxPassport fee and processing fee are paid to
 *   no one.
 * - A full refund before any payout: the client gets back every cent, and no
 *   payout is touched.
 *
 * Deletes only what it creates.
 */

const stripeMock = vi.hoisted(() => ({
  sessionsCreate: vi.fn(async () => ({
    id: `cs_test_${Math.random().toString(36).slice(2)}`,
    url: "http://checkout.url",
  })),
  refundsCreate: vi.fn(async (args: { amount: number }) => ({
    id: `re_test_${Math.random().toString(36).slice(2)}`,
    status: "succeeded",
    amount: args.amount,
  })),
  transfersCreate: vi.fn(async () => ({
    id: `tr_test_${Math.random().toString(36).slice(2)}`,
  })),
}));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: stripeMock.sessionsCreate } };
    paymentIntents = { retrieve: vi.fn(), cancel: vi.fn() };
    refunds = { create: stripeMock.refundsCreate };
    transfers = {
      create: stripeMock.transfersCreate,
      createReversal: vi.fn(),
    };
    webhooks = { constructEvent: vi.fn() };
  },
}));
// Cancelling sends a notification without waiting for it; stub it so it can't
// write after cleanup has deleted its user.
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn().mockResolvedValue({}) },
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
const PayoutSvc = (await import("../src/modules/payout/payout.service"))
  .default;

describe("event payment lifecycle (database)", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  const userIds: string[] = [];
  const policyIds: string[] = [];
  const eventIds: string[] = [];

  /**
   * An Event from the template, its booking, and its transactions.
   * `beforePricing` runs after the Event is created, before its lines are.
   */
  const bookEvent = async (
    daysAhead: number,
    beforePricing?: () => Promise<unknown>,
  ) => {
    const start = new Date(Date.now() + daysAhead * 86_400_000);
    const end = new Date(start.getTime() + 12 * 3_600_000);
    const event = await EventRequestSvc.spawnRequestFromTemplate({
      clientId: ids.client,
      templateId: ids.template,
      name: `Lifecycle event ${daysAhead}`,
      description: "desc",
      startAt: start,
      endAt: end,
      guestCount: 50,
    });
    eventIds.push(event.id);
    await beforePricing?.();
    const booking = await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: ids.client,
        guestCount: 50,
        totalAmount: event.totalAmount,
        status: "pending",
        startAt: start,
        endAt: end,
      },
    });
    await EventTransactionSvc.createTransactionsFromTemplate(
      event.id,
      booking.id,
    );
    return { eventId: event.id, bookingId: booking.id };
  };

  /** Checkout, then mark the invoice paid as the webhook would. */
  const pay = async (eventId: string) => {
    const { invoice } = await EventCheckoutSvc.createEventCheckout(
      eventId,
      ids.client,
    );
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid" },
    });
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: invoice.grossAmount,
        method: "card",
        providerReference: `pi_test_${runId}_${eventId}`,
        status: "paid",
        paidAt: new Date(),
      },
    });
    return invoice;
  };

  const lines = async (eventId: string) => [
    ...(await prisma.eventVenueTransaction.findMany({ where: { eventId } })),
    ...(await prisma.eventServiceTransaction.findMany({ where: { eventId } })),
  ];

  beforeAll(async () => {
    const user = async (key: string, extra: Record<string, unknown> = {}) => {
      const u = await prisma.user.create({
        data: {
          email: `lifecycle-${key}-${runId}@example.com`,
          name: `Lifecycle ${key}`,
          password: "pw",
          ...extra,
        },
      });
      userIds.push(u.id);
      return u.id;
    };
    // Paid out through Stripe Connect (mocked), so payouts reach `paid`.
    const connected = (key: string) => ({
      stripeAccountId: `acct_test_${key}_${runId}`,
      stripePayoutsEnabled: true,
    });
    ids.foxer = await user("foxer", {
      roleType: ["eventFoxer"],
      commissionPct: 10,
      ...connected("foxer"),
    });
    ids.client = await user("client", { isEmailVerified: true });
    ids.mayor = await user("mayor", connected("mayor"));
    ids.caterer = await user("caterer", connected("caterer"));

    const full = await prisma.cancellationPolicy.create({
      data: {
        name: `Lifecycle 100% ${runId}`,
        rules: { create: [{ hoursBeforeEvent: 0, refundPercent: 100 }] },
      },
    });
    policyIds.push(full.id);

    ids.venue = (
      await prisma.venue.create({
        data: {
          name: `Lifecycle Venue ${runId}`,
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
          cancellationPolicyId: full.id,
        },
      })
    ).id;
    ids.catering = (
      await prisma.service.create({
        data: {
          ownerId: ids.caterer,
          category: "catering",
          name: `Lifecycle catering ${runId}`,
          description: "desc",
          price: 5000,
          billingRate: "hourly",
          status: "available",
          cancellationPolicyId: full.id,
        },
      })
    ).id;
    ids.cateringRule = (
      await prisma.platformFeeConfig.create({
        data: {
          name: `Lifecycle catering ${runId}`,
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
          name: `Lifecycle template ${runId}`,
          description: "desc",
          category: "corporate",
          templateServices: { create: [{ serviceId: ids.catering }] },
          templateVenues: { create: [{ venueId: ids.venue }] },
        },
      })
    ).id;

    // The Events the payout and refund tests use, each priced at 10%.
    // Far apart: a Foxer needs the day before and after to travel.
    const paid = await bookEvent(30);
    ids.paidEvent = paid.eventId;
    ids.paidBooking = paid.bookingId;
    ids.refundedEvent = (await bookEvent(40)).eventId;
  });

  // Every filter is a list of ids this run created; see `only`.
  afterAll(async () => {
    await prisma.payout.deleteMany({ where: { providerId: only(...userIds) } });
    const payerId = only(ids.client);
    await prisma.refund.deleteMany({
      where: { payment: { invoice: { payerId } } },
    });
    await prisma.payment.deleteMany({ where: { invoice: { payerId } } });
    await prisma.checkout.deleteMany({ where: { invoice: { payerId } } });
    await prisma.invoice.deleteMany({ where: { payerId } });
    const eventId = only(...eventIds);
    await prisma.eventServiceTransaction.deleteMany({ where: { eventId } });
    await prisma.eventVenueTransaction.deleteMany({ where: { eventId } });
    await prisma.booking.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.eventTemplate.deleteMany({
      where: { id: only(ids.template) },
    });
    await prisma.platformFeeConfig.deleteMany({
      where: { id: only(ids.cateringRule) },
    });
    await prisma.service.deleteMany({ where: { id: only(ids.catering) } });
    await prisma.venue.deleteMany({ where: { id: only(ids.venue) } });
    await prisma.cancellationPolicy.deleteMany({
      where: { id: { in: policyIds } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("prices every line with the Event's stored rate, even if the EventFoxer changes it mid-booking", async () => {
    /** Each line uses `rate`, and the Event's commission is their sum. */
    const expectRate = async (eventId: string, rate: number) => {
      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(event.commissionPct?.toNumber()).toBe(rate);
      const rows = await lines(eventId);
      expect(rows).toHaveLength(2);
      let commission = new Prisma.Decimal(0);
      for (const row of rows) {
        expect(row.commissionPct?.toNumber()).toBe(rate);
        commission = commission.add(row.commissionAmount ?? 0);
      }
      expect(event.hostMarkupAmount.toNumber()).toBe(commission.toNumber());
    };

    // Created at 10%; the rate moves to 20% before the lines are priced.
    const changed = await bookEvent(50, () =>
      prisma.user.update({
        where: { id: ids.foxer },
        data: { commissionPct: 20 },
      }),
    );
    await expectRate(changed.eventId, 10);

    // The next Event gets the new rate.
    const next = await bookEvent(60);
    await expectRate(next.eventId, 20);
  });

  it("pays each Foxer their price and the EventFoxer the commission, and pays no one the fees", async () => {
    const invoice = await pay(ids.paidEvent);
    await PayoutSvc.createPayoutsForEventBooking(ids.paidBooking);

    const rows = await lines(ids.paidEvent);
    const payouts = await prisma.payout.findMany({
      where: { sourceId: { in: [ids.paidBooking, ...rows.map((r) => r.id)] } },
    });
    expect(payouts.every((p) => p.status === "paid")).toBe(true);

    // Each Foxer: their stored price.
    for (const row of rows) {
      const payout = payouts.find((p) => p.sourceId === row.id);
      expect(payout?.providerId).toBe(row.providerId);
      expect(payout?.payoutAmount.toNumber()).toBe(row.agreedPrice.toNumber());
    }
    // The EventFoxer: the commission total.
    const commission = rows.reduce(
      (sum, row) => sum.add(row.commissionAmount ?? 0),
      new Prisma.Decimal(0),
    );
    const host = payouts.find((p) => p.sourceType === "event_host_markup");
    expect(host?.providerId).toBe(ids.foxer);
    expect(host?.payoutAmount.toNumber()).toBe(commission.toNumber());

    // Nothing else: the fees stay with FoxPassport.
    expect(payouts).toHaveLength(rows.length + 1);
    const fees = rows.reduce(
      (sum, row) =>
        sum.add(row.platformFeeAmount ?? 0).add(row.processingFeeAmount ?? 0),
      new Prisma.Decimal(0),
    );
    const paidOut = payouts.reduce(
      (sum, p) => sum.add(p.payoutAmount),
      new Prisma.Decimal(0),
    );
    expect(paidOut.add(fees).toNumber()).toBe(invoice.grossAmount.toNumber());
  });

  it("refunds every cent on a full refund before any payout, and touches no payout", async () => {
    const invoice = await pay(ids.refundedEvent);
    stripeMock.transfersCreate.mockClear();

    const { totalRefunded } = await EventCheckoutSvc.cancelEvent(
      ids.refundedEvent,
      ids.client,
    );

    expect(totalRefunded).toBe(invoice.grossAmount.toNumber());
    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.status).toBe("refunded");

    const rows = await lines(ids.refundedEvent);
    expect(rows.every((r) => r.status === "cancelled")).toBe(true);
    expect(
      await prisma.payout.count({
        where: { sourceId: { in: rows.map((r) => r.id) } },
      }),
    ).toBe(0);
    expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
  });
});
