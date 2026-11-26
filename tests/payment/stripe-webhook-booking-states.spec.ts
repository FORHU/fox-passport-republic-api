import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";

import PaymentSvc from "../../src/modules/payment/payment.service";
import PaymentRepo from "../../src/modules/payment/payment.repository";
import BookingRepo from "../../src/modules/booking/booking.repository";
import { prisma } from "../../src/utils/prisma";

/**
 * api#362: what the Stripe webhook does to a booking's payment when a card is
 * declined and when a charge is refunded, in part or in full. Paid is pinned
 * in `settle-succeeded-intent.spec.ts`; repeats in `checkout.webhook.spec.ts`.
 */

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("payment_intent.payment_failed", () => {
  const PI = {
    id: "pi_failed_1",
    metadata: { bookingId: "bk_1" },
    last_payment_error: { message: "Your card was declined." },
  } as any;
  const fail = (intent = PI) =>
    PaymentSvc.handleStripeEvent({
      type: "payment_intent.payment_failed",
      data: { object: intent },
    } as any);

  function setup(over: { recorded?: unknown; payments?: unknown[] } = {}) {
    return {
      recorded: vi
        .spyOn(PaymentRepo, "getPaymentByTransactionId")
        .mockResolvedValue((over.recorded ?? null) as never),
      list: vi
        .spyOn(PaymentSvc, "getBookingPayments")
        .mockResolvedValue(
          (over.payments ?? [
            { id: "pay_1", status: PaymentStatus.pending, providerReference: null },
          ]) as never,
        ),
      setRef: vi
        .spyOn(PaymentRepo, "setTransactionId")
        .mockResolvedValue({} as never),
      failed: vi
        .spyOn(PaymentRepo, "markFailed")
        .mockResolvedValue({ count: 1 } as never),
      confirm: vi.spyOn(BookingRepo, "markConfirmed"),
    };
  }

  it("marks the booking's pending payment failed and links the intent", async () => {
    const s = setup();
    await fail();

    expect(s.setRef).toHaveBeenCalledWith("pay_1", "pi_failed_1");
    expect(s.failed).toHaveBeenCalledWith("pay_1");
    expect(s.confirm).not.toHaveBeenCalled();
  });

  it("never fails a payment that is already paid", async () => {
    const s = setup({
      recorded: {
        id: "pay_1",
        status: PaymentStatus.paid,
        providerReference: "pi_failed_1",
      },
    });
    await fail();

    expect(s.failed).not.toHaveBeenCalled();
    expect(s.setRef).not.toHaveBeenCalled();
  });

  it("does nothing when the booking has no pending payment", async () => {
    const s = setup({ payments: [] });
    await fail();

    expect(s.failed).not.toHaveBeenCalled();
  });

  it("ignores an intent that is not a booking payment", async () => {
    const s = setup();
    await fail({ ...PI, metadata: {} });

    expect(s.recorded).not.toHaveBeenCalled();
    expect(s.failed).not.toHaveBeenCalled();
  });
});

describe("charge.refunded", () => {
  const charge = (over: Record<string, unknown> = {}) =>
    ({
      id: "ch_1",
      payment_intent: "pi_paid_1",
      amount: 100000,
      amount_refunded: 100000,
      refunded: true,
      currency: "php",
      ...over,
    }) as any;
  const refund = (c: unknown) =>
    PaymentSvc.handleStripeEvent({
      type: "charge.refunded",
      data: { object: c },
    } as any);

  function setup(bookingStatus: BookingStatus = BookingStatus.cancelled) {
    return {
      payment: vi
        .spyOn(PaymentRepo, "getPaymentByTransactionId")
        .mockResolvedValue({
          id: "pay_1",
          status: PaymentStatus.paid,
          invoice: { items: [{ sourceId: "bk_1" }] },
        } as never),
      mark: vi
        .spyOn(PaymentRepo, "markRefundStatus")
        .mockResolvedValue({ count: 1 } as never),
      booking: vi.spyOn(BookingRepo, "findPaymentContext").mockResolvedValue({
        id: "bk_1",
        status: bookingStatus,
      } as never),
      cancel: vi.spyOn(BookingRepo, "cancel"),
    };
  }

  it("marks a partial refund partially_refunded and leaves the booking alone", async () => {
    const s = setup(BookingStatus.confirmed);
    await refund(charge({ amount_refunded: 40000, refunded: false }));

    expect(s.mark).toHaveBeenCalledWith("pay_1", false);
    expect(s.booking).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("marks a full refund refunded", async () => {
    const s = setup();
    await refund(charge());

    expect(s.mark).toHaveBeenCalledWith("pay_1", true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([
    BookingStatus.pending,
    BookingStatus.confirmed,
    BookingStatus.active,
  ])(
    "flags a full refund on a %s booking for a person, without cancelling it",
    async (status) => {
      const s = setup(status);
      await refund(charge());

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[PAYMENT-ATTENTION]"),
        expect.stringContaining("bk_1"),
      );
      expect(s.cancel).not.toHaveBeenCalled();
    },
  );

  it("does not flag again when the status did not change", async () => {
    const s = setup(BookingStatus.confirmed);
    s.mark.mockResolvedValue({ count: 0 } as never);
    await refund(charge());

    expect(s.booking).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("ignores a charge with nothing refunded or no payment of ours", async () => {
    const s = setup();
    await refund(charge({ amount_refunded: 0, refunded: false }));
    expect(s.payment).not.toHaveBeenCalled();

    s.payment.mockResolvedValue(null as never);
    await refund(charge());
    expect(s.mark).not.toHaveBeenCalled();
  });
});

describe("PaymentRepo.cancelExpiredPayments", () => {
  it("sweeps a stale failed payment like a pending one", async () => {
    const find = vi
      .spyOn(prisma.payment, "findMany")
      .mockResolvedValue([] as never);

    await PaymentRepo.cancelExpiredPayments();

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [PaymentStatus.pending, PaymentStatus.failed] },
        }),
      }),
    );
  });
});

describe("PaymentRepo.markRefundStatusFromRefunds", () => {
  function setup(amount: string, refunded: string | null) {
    vi.spyOn(prisma.payment, "findUnique").mockResolvedValue({
      amount: new Prisma.Decimal(amount),
    } as never);
    vi.spyOn(prisma.refund, "aggregate").mockResolvedValue({
      _sum: { amount: refunded === null ? null : new Prisma.Decimal(refunded) },
    } as never);
    return vi
      .spyOn(PaymentRepo, "markRefundStatus")
      .mockResolvedValue({ count: 1 } as never);
  }

  it("is partial while refunds are below the amount paid", async () => {
    const mark = setup("1000.00", "500.00");
    await PaymentRepo.markRefundStatusFromRefunds("pay_1");
    expect(mark).toHaveBeenCalledWith("pay_1", false);
  });

  it("is full once refunds reach the amount paid", async () => {
    const mark = setup("1000.00", "1000.00");
    await PaymentRepo.markRefundStatusFromRefunds("pay_1");
    expect(mark).toHaveBeenCalledWith("pay_1", true);
  });

  it("changes nothing when no refund has succeeded", async () => {
    const mark = setup("1000.00", null);
    await PaymentRepo.markRefundStatusFromRefunds("pay_1");
    expect(mark).not.toHaveBeenCalled();
  });
});
