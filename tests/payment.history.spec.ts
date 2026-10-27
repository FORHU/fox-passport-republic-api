import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentStatus } from "@prisma/client";

/**
 * A package's History shows when a booking was paid. Payments clear through
 * Stripe's webhook as often as through the guest's own confirmation, and the
 * webhook brings no user, so the entry names the guest who paid. It is
 * recorded only by the write that actually made the payment paid: the webhook
 * and the client both reach `updatePayment` for the same payment.
 */

const db = vi.hoisted(() => ({
  booking: { findUnique: vi.fn() },
  $transaction: vi.fn(async () => []),
  eventAssetTransaction: { updateMany: vi.fn() },
  eventServiceTransaction: { updateMany: vi.fn() },
  eventVenueTransaction: { updateMany: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const paymentRepo = vi.hoisted(() => ({
  getPaymentById: vi.fn(),
  updatePayment: vi.fn(),
  createPayment: vi.fn(async () => ({ id: "p1" })),
  transactionIdExists: vi.fn(async () => false),
}));
vi.mock("../src/modules/payment/payment.repository", () => ({
  default: paymentRepo,
  PENDING_PAYMENT_TTL_MS: 60 * 60 * 1000,
}));

const bookingRepo = vi.hoisted(() => ({
  markConfirmed: vi.fn(),
  setStripePaymentId: vi.fn(),
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: bookingRepo,
}));

const audit = vi.hoisted(() => ({ recordChangeBy: vi.fn(async () => {}) }));
vi.mock("../src/modules/audit/audit.service", () => audit);

vi.mock("../src/modules/event-request/event-request.service", () => ({
  default: { syncStatusFromBookings: vi.fn() },
}));
vi.mock("../src/modules/refund/refund.service", () => ({ default: class {} }));
vi.mock("../src/modules/stripe-connect/stripe-connect.service", () => ({
  default: class {},
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
}));

import PaymentSvc from "../src/modules/payment/payment.service";

const payment = (status: PaymentStatus) => ({
  id: "p1",
  status,
  createdAt: new Date(),
  paidAt: status === PaymentStatus.paid ? new Date() : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.booking.findUnique.mockResolvedValue({
    userId: "guest",
    event: { templateId: "t1" },
  });
  paymentRepo.updatePayment.mockResolvedValue({
    id: "p1",
    amount: "1500.00",
    invoice: { items: [{ sourceId: "b1" }] },
  });
});

describe("booking.paid on the package History", () => {
  it("records the guest's payment when it becomes paid", async () => {
    paymentRepo.getPaymentById.mockResolvedValue(
      payment(PaymentStatus.pending),
    );

    await PaymentSvc.updatePayment("p1", { paymentStatus: PaymentStatus.paid });

    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "guest",
      "booking.paid",
      "t1",
      { bookingId: "b1", amount: 1500 },
    );
  });

  it("records nothing again for a payment already paid", async () => {
    // The webhook redelivered, or the client confirmed after the webhook did.
    paymentRepo.getPaymentById.mockResolvedValue(payment(PaymentStatus.paid));

    await PaymentSvc.updatePayment("p1", { paymentStatus: PaymentStatus.paid });

    expect(audit.recordChangeBy).not.toHaveBeenCalled();
  });

  it("records a payment created already paid", async () => {
    await PaymentSvc.createPayment({
      bookingId: "b1",
      amount: 900,
      currency: "PHP",
      method: "stripe",
      paymentType: "full",
      paymentStatus: PaymentStatus.paid,
      transactionId: "pi_1",
    });

    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "guest",
      "booking.paid",
      "t1",
      { bookingId: "b1", amount: 900 },
    );
  });

  it("records nothing for a booking with no package", async () => {
    db.booking.findUnique.mockResolvedValue({
      userId: "guest",
      event: { templateId: null },
    });

    await PaymentSvc.createPayment({
      bookingId: "b1",
      amount: 900,
      currency: "PHP",
      method: "stripe",
      paymentType: "full",
      paymentStatus: PaymentStatus.paid,
      transactionId: "pi_1",
    });

    expect(audit.recordChangeBy).not.toHaveBeenCalled();
  });
});
