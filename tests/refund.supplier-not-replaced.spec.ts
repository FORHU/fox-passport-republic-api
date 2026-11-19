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
  prisma: { booking: { findUnique: m.bookingFind } },
}));
vi.mock("../src/modules/payment/payment.repository", () => ({
  default: { getBookingPayments: m.payments },
}));
vi.mock("../src/modules/event-transaction/event-conflict.service", () => ({
  default: { fullRefundDue: m.fullRefundDue },
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: {
    findForCancellation: m.findForCancellation,
    createRefund: m.createRefund,
    markPaymentRefunded: vi.fn(),
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
