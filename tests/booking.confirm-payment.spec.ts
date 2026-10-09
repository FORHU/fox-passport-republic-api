import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `POST /bookings/:id/confirm` used to mark *any* booking paid from a
 * client-supplied `{ amount, transactionId }` alone - no check the caller
 * owned the booking, and no check the transaction was real. `confirmPayment`
 * now requires the caller to be the booking's own client (or an admin), and
 * verifies the PaymentIntent with Stripe itself before trusting anything
 * about it - that it succeeded, that it was minted for this booking
 * (`PaymentSvc.createPaymentIntent` always stamps `metadata.bookingId`), and
 * its real amount and currency.
 */

const stripeRetrieve = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { retrieve: stripeRetrieve };
  },
}));

const bookingRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  setPaymentTransaction: vi.fn(),
  setStripePaymentId: vi.fn(),
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: bookingRepo,
}));

const paymentSvc = vi.hoisted(() => ({
  getBookingPayments: vi.fn(async () => []),
  updatePayment: vi.fn(),
  createPayment: vi.fn(async () => ({ id: "pay1" })),
  getPaymentById: vi.fn(async () => ({ id: "pay1", status: "paid" })),
  sweepExpiredPayments: vi.fn(),
}));
vi.mock("../src/modules/payment/payment.service", () => ({
  default: paymentSvc,
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: { event: { findUnique: vi.fn(async () => null) } },
}));

import BookingSvc from "../src/modules/booking/booking.service";

const SUCCEEDED_INTENT = {
  id: "pi_123",
  status: "succeeded",
  amount: 150000,
  currency: "php",
  metadata: { bookingId: "b1" },
};

const INPUT = { amount: 1500, method: "stripe", transactionId: "pi_123" };

beforeEach(() => {
  vi.clearAllMocks();
  bookingRepo.findById.mockResolvedValue({ id: "b1", userId: "guest" });
  stripeRetrieve.mockResolvedValue(SUCCEEDED_INTENT);
  paymentSvc.getBookingPayments.mockResolvedValue([]);
  paymentSvc.createPayment.mockResolvedValue({ id: "pay1" });
  paymentSvc.getPaymentById.mockResolvedValue({ id: "pay1", status: "paid" });
  vi.spyOn(BookingSvc, "getBookingById").mockResolvedValue({
    id: "b1",
    eventId: null,
  } as never);
});

const confirm = (userId?: string, systemRole = "user") =>
  BookingSvc.confirmPayment(
    "b1",
    INPUT,
    userId ? { userId, systemRole } : ({} as never),
  );

describe("BookingSvc.confirmPayment — who may call it", () => {
  it("refuses someone who isn't the booking's own client", async () => {
    await expect(confirm("stranger")).rejects.toThrow("Unauthorized");
    expect(stripeRetrieve).not.toHaveBeenCalled();
  });

  it("lets the booking's own client confirm it", async () => {
    await expect(confirm("guest")).resolves.toBeDefined();
  });

  it("lets an admin confirm someone else's booking", async () => {
    await expect(confirm("staff", "admin")).resolves.toBeDefined();
  });
});

describe("BookingSvc.confirmPayment — verifying with Stripe", () => {
  it("refuses a transaction id Stripe doesn't recognise", async () => {
    stripeRetrieve.mockRejectedValue(new Error("No such payment_intent"));
    await expect(confirm("guest")).rejects.toThrow(
      "Could not verify this payment with Stripe",
    );
  });

  it("refuses a PaymentIntent that hasn't succeeded", async () => {
    stripeRetrieve.mockResolvedValue({
      ...SUCCEEDED_INTENT,
      status: "requires_payment_method",
    });
    await expect(confirm("guest")).rejects.toThrow(
      "This payment has not succeeded at Stripe",
    );
  });

  it("refuses a real, succeeded PaymentIntent made for a different booking", async () => {
    stripeRetrieve.mockResolvedValue({
      ...SUCCEEDED_INTENT,
      metadata: { bookingId: "some-other-booking" },
    });
    await expect(confirm("guest")).rejects.toThrow(
      "This payment was not made for this booking",
    );
  });

  it("refuses a fabricated id that was never a real PaymentIntent", async () => {
    await expect(
      BookingSvc.confirmPayment(
        "b1",
        { amount: 1, method: "cash", transactionId: "not-a-real-id" },
        { userId: "guest", systemRole: "user" },
      ),
    ).rejects.toThrow("Unsupported payment method");
    expect(stripeRetrieve).not.toHaveBeenCalled();
  });

  it("trusts Stripe's amount and currency, not the client's", async () => {
    await confirm("guest");
    expect(paymentSvc.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500, // 150000 minor units -> 1500, from Stripe, not INPUT.amount
        currency: "PHP",
        method: "stripe",
      }),
    );
  });

  it("marks a pending payment paid using Stripe's transaction id", async () => {
    paymentSvc.getBookingPayments.mockResolvedValue([
      { id: "pending1", status: "pending", providerReference: null },
    ]);
    await confirm("guest");
    expect(paymentSvc.updatePayment).toHaveBeenCalledWith(
      "pending1",
      expect.objectContaining({ paymentStatus: "paid" }),
    );
    expect(bookingRepo.setPaymentTransaction).toHaveBeenCalledWith(
      "pending1",
      expect.objectContaining({ transactionId: "pi_123", method: "stripe" }),
    );
  });
});
