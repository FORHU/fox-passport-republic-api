import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/prisma";

/**
 * #264 T13 (payouts) and T14 (refunds) against a real database, with the
 * plan's worked example: venue 10,000 (5% fee) + catering 5,000 (6% fee), the
 * EventFoxer's 10% commission, 3% processing.
 *
 * - Checkout stores the snapshot of a line it priced on the spot (an item
 *   added after booking), so payouts and refunds read what was charged.
 * - Cancelling refunds each line's WHOLE total (price + commission + fee +
 *   processing) times that Foxer's policy % (owner decision 2026-11-10),
 *   and claws back only the Foxer's share from their payout.
 * - An admin can refund up to a line's whole total, not just its price.
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
}));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: stripeMock.sessionsCreate } };
    paymentIntents = { retrieve: vi.fn(), cancel: vi.fn() };
    refunds = { create: stripeMock.refundsCreate };
    transfers = { createReversal: vi.fn() };
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
const PayoutSvc = (await import("../src/modules/payout/payout.service"))
  .default;
const AdminSvc = (await import("../src/modules/admin/admin.service")).default;
const { eventBreakdownLines } =
  await import("../src/modules/payment/event-breakdown-snapshot");

describe("event payment refunds and payouts (database)", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  const userIds: string[] = [];
  const policyIds: string[] = [];

  beforeAll(async () => {
    const user = async (key: string, extra: Record<string, unknown> = {}) => {
      const u = await prisma.user.create({
        data: {
          email: `refunds-${key}-${runId}@example.com`,
          name: `Refunds ${key}`,
          password: "pw",
          ...extra,
        },
      });
      userIds.push(u.id);
      return u.id;
    };
    ids.foxer = await user("foxer", {
      roleType: ["eventFoxer"],
      commissionPct: 10,
    });
    ids.client = await user("client", { isEmailVerified: true });
    ids.mayor = await user("mayor");
    ids.caterer = await user("caterer");
    ids.dj = await user("dj");
    ids.admin = await user("admin", { systemRole: "admin" });

    const policy = async (refundPercent: number) => {
      const p = await prisma.cancellationPolicy.create({
        data: {
          name: `Refunds ${refundPercent}% ${runId}`,
          rules: { create: [{ hoursBeforeEvent: 0, refundPercent }] },
        },
      });
      policyIds.push(p.id);
      return p.id;
    };
    const full = await policy(100);
    const half = await policy(50);

    ids.venue = (
      await prisma.venue.create({
        data: {
          name: `Refunds Venue ${runId}`,
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
          cancellationPolicyId: half,
        },
      })
    ).id;
    const service = async (
      ownerId: string,
      category: "catering" | "dj",
      price: number,
    ) =>
      (
        await prisma.service.create({
          data: {
            ownerId,
            category,
            name: `Refunds ${category} ${runId}`,
            description: "desc",
            price,
            billingRate: "hourly",
            status: "available",
            cancellationPolicyId: full,
          },
        })
      ).id;
    ids.catering = await service(ids.caterer, "catering", 5000);
    ids.djService = await service(ids.dj, "dj", 2000);

    ids.cateringRule = (
      await prisma.platformFeeConfig.create({
        data: {
          name: `Refunds catering ${runId}`,
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
          name: `Refunds template ${runId}`,
          description: "desc",
          category: "corporate",
          templateServices: { create: [{ serviceId: ids.catering }] },
          templateVenues: { create: [{ venueId: ids.venue }] },
        },
      })
    ).id;

    const start = new Date(Date.now() + 30 * 86_400_000);
    const end = new Date(start.getTime() + 12 * 3_600_000);
    ids.event = (
      await EventRequestSvc.spawnRequestFromTemplate({
        clientId: ids.client,
        templateId: ids.template,
        name: "Refunds event",
        description: "desc",
        startAt: start,
        endAt: end,
        guestCount: 50,
      })
    ).id;
    ids.booking = (
      await prisma.booking.create({
        data: {
          eventId: ids.event,
          userId: ids.client,
          guestCount: 50,
          totalAmount: 17750,
          status: "pending",
          startAt: start,
          endAt: end,
        },
      })
    ).id;
    await EventTransactionSvc.createTransactionsFromTemplate(
      ids.event,
      ids.booking,
    );
    // Added to the booking afterwards, with no snapshot: checkout prices it
    // (2,000 + 200 + 100 default fee + 60 processing = 2,360).
    ids.djTx = (
      await prisma.eventServiceTransaction.create({
        data: {
          eventId: ids.event,
          bookingId: ids.booking,
          serviceId: ids.djService,
          providerId: ids.dj,
          agreedPrice: 2000,
          status: "pending",
        },
      })
    ).id;
  });

  afterAll(async () => {
    const eventId = ids.event;
    await prisma.refund.deleteMany({
      where: { payment: { invoice: { payerId: ids.client } } },
    });
    await prisma.payment.deleteMany({
      where: { invoice: { payerId: ids.client } },
    });
    await prisma.checkout.deleteMany({
      where: { invoice: { payerId: ids.client } },
    });
    await prisma.invoice.deleteMany({ where: { payerId: ids.client } });
    await prisma.requestIdempotencyKey.deleteMany({
      where: { requesterId: ids.admin },
    });
    if (eventId) {
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
    await prisma.cancellationPolicy.deleteMany({
      where: { id: { in: policyIds } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("charges the whole Event and stores the snapshot of the line it priced on the spot", async () => {
    const { invoice } = await EventCheckoutSvc.createEventCheckout(
      ids.event,
      ids.client,
    );
    ids.invoice = invoice.id;
    expect(invoice.grossAmount.toNumber()).toBe(20110); // 17,750 + 2,360

    const dj = await prisma.eventServiceTransaction.findUniqueOrThrow({
      where: { id: ids.djTx },
    });
    expect({
      commissionAmount: dj.commissionAmount?.toNumber(),
      platformFeeAmount: dj.platformFeeAmount?.toNumber(),
      processingFeeAmount: dj.processingFeeAmount?.toNumber(),
    }).toEqual({
      commissionAmount: 200,
      platformFeeAmount: 100,
      processingFeeAmount: 60,
    });

    // Paid.
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid" },
    });
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: 20110,
        method: "card",
        providerReference: `pi_test_${runId}`,
        status: "paid",
        paidAt: new Date(),
      },
    });
  });

  it("pays the EventFoxer the commission charged on every line, including one added later", async () => {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: ids.booking },
      include: {
        event: true,
        assetTransactions: { where: { included: true } },
        serviceTransactions: { where: { included: true } },
        venueTransactions: { where: { included: true } },
      },
    });
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: ids.invoice },
    });
    const charged = eventBreakdownLines(invoice.platformFeeSnapshot);
    // 1,000 venue + 500 catering + 200 DJ, not the Event's 1,500.
    expect(PayoutSvc.eventFoxerCommission(booking, charged).toNumber()).toBe(
      1700,
    );

    // A line the Foxer rejected earns no commission.
    const rejected = {
      ...booking,
      serviceTransactions: booking.serviceTransactions.map((tx) =>
        tx.id === ids.djTx ? { ...tx, status: "rejected" as const } : tx,
      ),
    };
    expect(PayoutSvc.eventFoxerCommission(rejected, charged).toNumber()).toBe(
      1500,
    );

    // Nor does a line the invoice never charged.
    const uncharged = new Map(charged);
    uncharged.delete(ids.djTx);
    expect(PayoutSvc.eventFoxerCommission(booking, uncharged).toNumber()).toBe(
      1500,
    );
  });

  it("keeps the Event's markup as the EventFoxer's commission when the invoice has no breakdown", () => {
    const commission = PayoutSvc.eventFoxerCommission(
      {
        event: { hostMarkupAmount: new Prisma.Decimal(321) },
        assetTransactions: [],
        serviceTransactions: [{ id: "tx", status: "approved" }],
        venueTransactions: [],
      },
      new Map(),
    );
    expect(commission.toNumber()).toBe(321);
  });

  it("lets an admin refund up to a line's whole total, not just its price", async () => {
    // The DJ line's whole total is 2,360; its price alone is 2,000.
    await expect(
      AdminSvc.createItemizedRefund({
        kind: "service",
        transactionId: ids.djTx,
        amount: 2361,
        reason: "test",
        adminId: ids.admin,
        idempotencyKey: `refunds-${runId}-over`,
      }),
    ).rejects.toThrow(/remaining: 2360/);
  });

  it("refunds each line's whole total at its Foxer's policy %, minus earlier refunds, and claws back only the Foxer's share", async () => {
    // An admin refunds 360 of the DJ line first.
    await AdminSvc.createItemizedRefund({
      kind: "service",
      transactionId: ids.djTx,
      amount: 360,
      reason: "test",
      adminId: ids.admin,
      idempotencyKey: `refunds-${runId}-part`,
    });

    stripeMock.refundsCreate.mockClear();
    // A wallet refund often comes back `pending`; it still counts.
    stripeMock.refundsCreate.mockImplementation(async (args) => ({
      id: `re_test_${Math.random().toString(36).slice(2)}`,
      status: args.amount === 200000 ? "pending" : "succeeded",
      amount: args.amount,
    }));
    const reverse = vi.spyOn(PayoutSvc, "reversePayoutForSource");

    const { totalRefunded } = await EventCheckoutSvc.cancelEvent(
      ids.event,
      ids.client,
    );

    // Venue 11,800 × 50% + catering 5,950 × 100% + DJ 2,360 × 100%, but only
    // the 2,000 left on the DJ line after the admin's 360.
    expect(totalRefunded).toBe(5900 + 5950 + 2000);
    const cents = stripeMock.refundsCreate.mock.calls
      .map(([args]) => args.amount)
      .sort((a, b) => a - b);
    expect(cents).toEqual([200000, 590000, 595000]);

    // The Foxer's share only: venue 10,000 × 50%, catering 5,000, and the DJ
    // price's share of the 2,000 refund (2,000 × 2,000 / 2,360).
    const clawed = reverse.mock.calls
      .map(([, amount]) => new Prisma.Decimal(amount).toNumber())
      .sort((a, b) => a - b);
    expect(clawed).toEqual([1694.92, 5000, 5000]);
    // Each reversal names the Foxer, so an investor's payout on the same
    // line is never the one reversed.
    for (const [, , target] of reverse.mock.calls) {
      expect(target?.providerId).toBeTruthy();
    }
    reverse.mockRestore();
    stripeMock.refundsCreate.mockImplementation(async (args) => ({
      id: `re_test_${Math.random().toString(36).slice(2)}`,
      status: "succeeded",
      amount: args.amount,
    }));

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: ids.invoice },
    });
    expect(invoice.status).toBe("partially_refunded");
  });

  it("won't let an admin refund a line the cancellation already refunded", async () => {
    await expect(
      AdminSvc.createItemizedRefund({
        kind: "service",
        transactionId: ids.djTx,
        amount: 1,
        reason: "test",
        adminId: ids.admin,
        idempotencyKey: `refunds-${runId}-twice`,
      }),
    ).rejects.toThrow(/remaining: 0/);
  });
});
