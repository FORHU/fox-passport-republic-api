import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The payment reads used to need only a sign-in, so anyone holding a booking
 * id could read its payments and balance, and anyone holding a transaction id
 * could read that payment. These pin who gets through now and that everyone
 * else sees the same "not found" a missing booking or payment gives.
 */

const access = vi.hoisted(() => ({
  canOnEvent: vi.fn(async () => false),
  canOnVenue: vi.fn(async () => false),
}));

vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: access,
}));

import PaymentSvc from "../src/modules/payment/payment.service";
import BookingRepo from "../src/modules/booking/booking.repository";

const BOOKING = {
  id: "b1",
  status: "confirmed",
  stripePaymentId: null,
  userId: "guest",
  eventId: "e1",
  event: { organizerId: "owner" },
};

const PAYMENT = {
  id: "p1",
  invoice: {
    payer: { id: "guest", name: "Guest", email: "guest@example.com" },
    items: [{ sourceId: "b1" }],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  access.canOnEvent.mockResolvedValue(false);
  vi.spyOn(BookingRepo, "findPaymentContext").mockImplementation(
    async (id: string) =>
      id === "b1" ? (structuredClone(BOOKING) as never) : null,
  );
  vi.spyOn(PaymentSvc, "getPaymentByTransactionId").mockResolvedValue(
    structuredClone(PAYMENT) as never,
  );
});

const checkBooking = (userId: string, systemRole = "user", bookingId = "b1") =>
  PaymentSvc.assertCanViewBookingPayments(bookingId, { userId, systemRole });

const readTxn = (userId: string, systemRole = "user") =>
  PaymentSvc.getPaymentByTransactionIdForViewer("txn_1", {
    userId,
    systemRole,
  });

describe("PaymentSvc.assertCanViewBookingPayments", () => {
  it("lets in the guest who booked", async () => {
    await expect(checkBooking("guest")).resolves.toBeUndefined();
  });

  it("lets in an admin without loading the booking", async () => {
    await expect(checkBooking("someone", "admin")).resolves.toBeUndefined();
    expect(BookingRepo.findPaymentContext).not.toHaveBeenCalled();
  });

  it("lets in whoever may see the Event's sales", async () => {
    access.canOnEvent.mockImplementation(
      async (eventId: string, userId: string, permission: string) =>
        eventId === "e1" &&
        userId === "organizer" &&
        permission === "event:view-sales",
    );
    await expect(checkBooking("organizer")).resolves.toBeUndefined();
  });

  it("refuses a stranger with the same message as a missing booking", async () => {
    await expect(checkBooking("stranger")).rejects.toThrow("Booking not found");
    await expect(checkBooking("guest", "user", "missing")).rejects.toThrow(
      "Booking not found",
    );
  });

  it("refuses an admin secretary, who can't read all payments", async () => {
    await expect(checkBooking("someone", "admin_secretary")).rejects.toThrow(
      "Booking not found",
    );
  });
});

describe("PaymentSvc.getPaymentByTransactionIdForViewer", () => {
  it("lets in the payer and an admin", async () => {
    await expect(readTxn("guest")).resolves.toMatchObject({ id: "p1" });
    await expect(readTxn("someone", "admin")).resolves.toMatchObject({
      id: "p1",
    });
  });

  it("lets in someone who may see a booking the invoice covers", async () => {
    vi.spyOn(PaymentSvc, "getPaymentByTransactionId").mockResolvedValue({
      ...structuredClone(PAYMENT),
      invoice: { ...PAYMENT.invoice, payer: { id: "someone-else" } },
    } as never);
    access.canOnEvent.mockImplementation(
      async (_e: string, userId: string) => userId === "organizer",
    );
    await expect(readTxn("organizer")).resolves.toMatchObject({ id: "p1" });
  });

  it("refuses a stranger with the same message as a missing payment", async () => {
    await expect(readTxn("stranger")).rejects.toThrow("Payment not found");
  });

  it("does not swallow a real failure while checking a booking", async () => {
    vi.spyOn(BookingRepo, "findPaymentContext").mockRejectedValue(
      new Error("database down"),
    );
    await expect(readTxn("stranger")).rejects.toThrow("database down");
  });
});
