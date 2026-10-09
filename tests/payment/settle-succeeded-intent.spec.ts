import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";

vi.mock("../../src/infrastructure/socket/invalidate", () => ({
  announceToAdmins: vi.fn(),
  announceToUser: vi.fn(),
}));

import PaymentSvc from "../../src/modules/payment/payment.service";
import PaymentRepo from "../../src/modules/payment/payment.repository";
import BookingRepo from "../../src/modules/booking/booking.repository";
import { AppError } from "../../src/utils/errors";

/**
 * `settleSucceededIntent` is the legacy `payment_intent.succeeded` handler.
 * Stripe delivers at least once and retries anything not answered 2xx, so it
 * has to be safe to run again after a partial failure and must not swallow a
 * failure a retry could fix. These pin both halves.
 */
const PI = {
  id: "pi_test_1",
  amount: 100000,
  currency: "php",
  metadata: { bookingId: "bk_1" },
} as any;

const settle = () => (PaymentSvc as any).settleSucceededIntent(PI);

const pendingPayment = {
  id: "pay_1",
  status: PaymentStatus.pending,
  providerReference: null,
};

let spies: Record<string, ReturnType<typeof vi.spyOn>>;

function setup(
  over: {
    booking?: unknown;
    recorded?: unknown;
    pending?: unknown[];
  } = {},
) {
  spies = {
    context: vi.spyOn(BookingRepo, "findPaymentContext").mockResolvedValue(
      ("booking" in over
        ? over.booking
        : {
            status: BookingStatus.pending,
            stripePaymentId: null,
            userId: "u1",
            event: { organizerId: "o1" },
          }) as never,
    ),
    recorded: vi
      .spyOn(PaymentRepo, "getPaymentByTransactionId")
      .mockResolvedValue((over.recorded ?? null) as never),
    list: vi
      .spyOn(PaymentSvc, "getBookingPayments")
      .mockResolvedValue((over.pending ?? [pendingPayment]) as never),
    setRef: vi
      .spyOn(PaymentRepo, "setTransactionId")
      .mockResolvedValue({} as never),
    update: vi
      .spyOn(PaymentSvc, "updatePayment")
      .mockResolvedValue({} as never),
    create: vi
      .spyOn(PaymentSvc, "createPayment")
      .mockResolvedValue({} as never),
    link: vi
      .spyOn(BookingRepo, "setStripePaymentId")
      .mockResolvedValue({} as never),
    confirm: vi
      .spyOn(BookingRepo, "markConfirmed")
      .mockResolvedValue({} as never),
  };
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("settleSucceededIntent", () => {
  it("attaches the PaymentIntent id BEFORE marking the payment paid", async () => {
    setup();
    await settle();

    expect(spies.setRef).toHaveBeenCalledWith("pay_1", "pi_test_1");
    expect(spies.update).toHaveBeenCalledWith("pay_1", {
      paymentStatus: PaymentStatus.paid,
    });
    expect(spies.setRef.mock.invocationCallOrder[0]).toBeLessThan(
      spies.update.mock.invocationCallOrder[0],
    );
    expect(spies.link).toHaveBeenCalledWith("bk_1", "pi_test_1");
    expect(spies.confirm).toHaveBeenCalledWith("bk_1");
    expect(spies.create).not.toHaveBeenCalled();
  });

  it("creates a paid payment when there is no pending one to settle", async () => {
    setup({ pending: [] });
    await settle();

    expect(spies.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "bk_1",
        transactionId: "pi_test_1",
        paymentStatus: PaymentStatus.paid,
      }),
    );
    expect(spies.update).not.toHaveBeenCalled();
  });

  it("finishes a payment a previous delivery only got as far as tagging", async () => {
    setup({
      recorded: {
        id: "pay_1",
        status: PaymentStatus.pending,
        providerReference: "pi_test_1",
      },
    });
    await settle();

    // The retry must complete the same payment, not record a second one.
    expect(spies.setRef).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.update).toHaveBeenCalledWith("pay_1", {
      paymentStatus: PaymentStatus.paid,
    });
    expect(spies.confirm).toHaveBeenCalledWith("bk_1");
  });

  it("changes nothing when the same delivery arrives after it was fully handled", async () => {
    setup({
      recorded: {
        id: "pay_1",
        status: PaymentStatus.paid,
        providerReference: "pi_test_1",
      },
      booking: {
        status: BookingStatus.confirmed,
        stripePaymentId: "pi_test_1",
        userId: "u1",
        event: { organizerId: "o1" },
      },
    });

    await expect(settle()).resolves.toBeUndefined();

    expect(spies.setRef).not.toHaveBeenCalled();
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.link).not.toHaveBeenCalled();
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("rethrows a transient failure so the webhook answers 5xx and Stripe retries", async () => {
    setup();
    spies.confirm.mockRejectedValue(new Error("connection reset"));

    await expect(settle()).rejects.toThrow("connection reset");
  });

  it("rethrows a transient failure while recording the payment", async () => {
    setup();
    spies.update.mockRejectedValue(new Error("deadlock detected"));

    await expect(settle()).rejects.toThrow("deadlock detected");
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("logs a payment that expired or was cancelled loudly and does not ask Stripe to retry", async () => {
    setup();
    spies.update.mockRejectedValue(
      new AppError("Payment has expired and is now cancelled", 409),
    );

    await expect(settle()).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[PAYMENT-ATTENTION]"),
      expect.stringContaining("pi_test_1"),
    );
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("carries on when the Stripe id already belongs to another booking", async () => {
    setup();
    spies.link.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(settle()).resolves.toBeUndefined();
    expect(spies.confirm).toHaveBeenCalledWith("bk_1");
  });

  it("rethrows any other failure linking the Stripe id", async () => {
    setup();
    spies.link.mockRejectedValue(new Error("timeout"));

    await expect(settle()).rejects.toThrow("timeout");
  });
});
