import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * ADR 0010 decision 2: a Supplier that declined or clashed and was not
 * replaced within its deadline lets the citizen cancel for a full refund,
 * whatever the cancellation policy says.
 */

const m = vi.hoisted(() => ({
  bookingFind: vi.fn(),
  payments: vi.fn(),
  fullRefundDue: vi.fn(),
  stripeRefund: vi.fn(),
  findForCancellation: vi.fn(),
  createRefund: vi.fn(),
  cancel: vi.fn(),
  refunded: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class {
    refunds = { create: m.stripeRefund };
    paymentIntents = { cancel: vi.fn() };
  },
}));
vi.mock("../src/config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  STRIPE_SECRET_KEY: "sk_test",
}));
vi.mock("../src/utils/prisma", () => ({
  prisma: {
    booking: { findUnique: m.bookingFind },
    refund: { findMany: m.refunded },
  },
}));
vi.mock("../src/modules/payment/payment.repository", () => ({
  default: {
    getBookingPayments: m.payments,
    markRefundStatusFromRefunds: vi.fn(),
  },
}));
vi.mock("../src/modules/event-transaction/event-conflict.service", () => ({
  default: { fullRefundDue: m.fullRefundDue },
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: {
    findForCancellation: m.findForCancellation,
    createRefund: m.createRefund,
    markPaymentCancelled: vi.fn(),
    cancel: m.cancel,
  },
}));
vi.mock("../src/modules/event-request/event-request.service", () => ({
  default: { syncStatusFromBookings: vi.fn() },
}));
vi.mock("../src/modules/promotion/promotion.service", () => ({
  default: { releaseRedemption: vi.fn(async () => undefined) },
}));
vi.mock("../src/utils/emails/cancellation", () => ({
  sendBookingCancelledEmail: vi.fn(),
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
}));

import RefundSvc from "../src/modules/refund/refund.service";
import BookingSvc from "../src/modules/booking/booking.service";

const HOUR = 3_600_000;
/** 50% back from 72 hours out; the event is 100 hours away. */
const policy = {
  name: "Moderate",
  rules: [{ hoursBeforeEvent: 72, refundPercent: 50 }],
};
const booking = (hoursAway = 100) => ({
  id: "b1",
  userId: "citizen1",
  eventId: "e1",
  status: "confirmed",
  startAt: new Date(Date.now() + hoursAway * HOUR),
  user: { id: "citizen1", name: "Ada", email: null },
  event: {
    name: "Garden wedding",
    organizerId: "host1",
    templateId: null,
    template: { cancellationPolicy: policy },
    venueTransactions: [],
    serviceTransactions: [],
  },
});
const paid = [
  {
    id: "pay1",
    status: "paid",
    amount: new Prisma.Decimal(1000),
    providerReference: "pi_1",
  },
];

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.bookingFind.mockResolvedValue(booking());
  m.findForCancellation.mockResolvedValue(booking());
  m.payments.mockResolvedValue(paid);
  m.stripeRefund.mockResolvedValue({ id: "re_1", status: "succeeded" });
  m.createRefund.mockImplementation(async (r) => r);
  m.cancel.mockResolvedValue({ id: "b1", status: "cancelled" });
  m.refunded.mockResolvedValue([]);
  vi.spyOn(
    BookingSvc as unknown as { recordForPackage: () => Promise<void> },
    "recordForPackage",
  ).mockResolvedValue();
  vi.spyOn(
    BookingSvc as unknown as { notifyBookingCancelled: () => void },
    "notifyBookingCancelled",
  ).mockReturnValue();
  vi.spyOn(
    BookingSvc as unknown as { notifyWaitlist: () => Promise<void> },
    "notifyWaitlist",
  ).mockResolvedValue();
});

describe("the cancel check", () => {
  it("offers a full refund once a Supplier is past its deadline", async () => {
    m.fullRefundDue.mockResolvedValue(true);

    const out = await RefundSvc.checkEligibility("b1", "citizen1");

    expect(m.fullRefundDue).toHaveBeenCalledWith("e1", expect.any(Date));
    expect(out).toMatchObject({
      eligible: true,
      fullRefund: true,
      refundPercent: 100,
      message: "Full refund — a Supplier was not replaced in time",
    });
    expect(out.estimatedRefund.toNumber()).toBe(1000);
  });

  it("follows the policy otherwise", async () => {
    m.fullRefundDue.mockResolvedValue(false);

    const out = await RefundSvc.checkEligibility("b1", "citizen1");

    expect(out).toMatchObject({ fullRefund: false, refundPercent: 50 });
    expect(out.estimatedRefund.toNumber()).toBe(500);
  });

  it("does not reopen cancelling once the event has started", async () => {
    m.bookingFind.mockResolvedValue(booking(-1));
    m.fullRefundDue.mockResolvedValue(true);

    const out = await RefundSvc.checkEligibility("b1", "citizen1");

    expect(out.eligible).toBe(false);
    expect(m.fullRefundDue).not.toHaveBeenCalled();
  });
});

describe("cancelling", () => {
  it("refunds everything paid once a Supplier is past its deadline", async () => {
    m.fullRefundDue.mockResolvedValue(true);

    await BookingSvc.cancelWithRefunds("b1", "citizen1");

    expect(m.stripeRefund).toHaveBeenCalledWith({
      payment_intent: "pi_1",
      amount: 100000,
    });
    const row = m.createRefund.mock.calls[0][0];
    expect(row.amount.toNumber()).toBe(1000);
    expect(row.reason).toBe(
      "Full refund: a Supplier was not replaced within its deadline",
    );
  });

  it("refunds by the policy otherwise", async () => {
    m.fullRefundDue.mockResolvedValue(false);

    await BookingSvc.cancelWithRefunds("b1", "citizen1");

    expect(m.stripeRefund).toHaveBeenCalledWith({
      payment_intent: "pi_1",
      amount: 50000,
    });
    expect(m.createRefund.mock.calls[0][0].reason).toContain("Moderate");
  });
});

describe("what already went back is not refunded twice", () => {
  // 1000 paid, 300 of it already refunded (a change's lower price).
  beforeEach(() =>
    m.refunded.mockResolvedValue([
      { paymentId: "pay1", amount: new Prisma.Decimal(300) },
    ]),
  );

  it("caps the cancel check at what is left", async () => {
    m.fullRefundDue.mockResolvedValue(true);

    const out = await RefundSvc.checkEligibility("b1", "citizen1");

    expect(out.estimatedRefund.toNumber()).toBe(700);
    expect(m.refunded.mock.calls[0][0].where).toEqual({
      paymentId: { in: ["pay1"] },
      status: { in: ["succeeded", "pending"] },
    });
  });

  it("refunds only what is left when cancelling in full", async () => {
    m.fullRefundDue.mockResolvedValue(true);

    await BookingSvc.cancelWithRefunds("b1", "citizen1");

    expect(m.stripeRefund).toHaveBeenCalledWith({
      payment_intent: "pi_1",
      amount: 70000,
    });
  });

  it("takes a policy refund from the original, up to what is left", async () => {
    m.fullRefundDue.mockResolvedValue(false);

    // 50% of 1000 is 500, and 700 is left: 500.
    const out = await RefundSvc.checkEligibility("b1", "citizen1");

    expect(out.estimatedRefund.toNumber()).toBe(500);
  });
});

describe("RefundSvc.refundFor", () => {
  const D = (n: number) => new Prisma.Decimal(n);

  it("is the percentage of the payment, capped at what is left", () => {
    expect(RefundSvc.refundFor(D(1000), undefined, 100).toNumber()).toBe(1000);
    expect(RefundSvc.refundFor(D(1000), D(300), 100).toNumber()).toBe(700);
    expect(RefundSvc.refundFor(D(1000), D(300), 50).toNumber()).toBe(500);
    expect(RefundSvc.refundFor(D(1000), D(1000), 100).toNumber()).toBe(0);
  });
});
