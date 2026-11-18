import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  findById: vi.fn(),
  cancel: vi.fn(),
  markPaymentCancelled: vi.fn(),
  getBookingPayments: vi.fn(),
  sync: vi.fn(),
  release: vi.fn(),
  notify: vi.fn(),
  record: vi.fn(),
  assetFind: vi.fn(),
  serviceFind: vi.fn(),
  venueFind: vi.fn(),
  assetUpdate: vi.fn(),
  serviceUpdate: vi.fn(),
  venueUpdate: vi.fn(),
  stripeCancel: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { cancel: db.stripeCancel };
  },
}));
vi.mock("../src/config", () => ({ STRIPE_SECRET_KEY: "sk_test" }));
vi.mock("../src/utils/prisma", () => ({
  prisma: {
    eventAssetTransaction: {
      findMany: db.assetFind,
      updateMany: db.assetUpdate,
    },
    eventServiceTransaction: {
      findMany: db.serviceFind,
      updateMany: db.serviceUpdate,
    },
    eventVenueTransaction: {
      findMany: db.venueFind,
      updateMany: db.venueUpdate,
    },
    $transaction: async (ops: unknown[]) => Promise.all(ops),
  },
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: {
    findById: db.findById,
    cancel: db.cancel,
    markPaymentCancelled: db.markPaymentCancelled,
  },
}));
vi.mock("../src/modules/payment/payment.repository", () => ({
  default: { getBookingPayments: db.getBookingPayments },
}));
vi.mock("../src/modules/event-request/event-request.service", () => ({
  default: { syncStatusFromBookings: db.sync },
}));
vi.mock("../src/modules/promotion/promotion.service", () => ({
  default: { releaseRedemption: db.release },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: db.notify },
}));
vi.mock("../src/modules/audit/audit.service", () => ({
  recordChangeBy: db.record,
}));

import BookingHostDeclineSvc from "../src/modules/booking/booking-host-decline.service";

const booking = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  userId: "citizen1",
  eventId: "e1",
  status: "pending",
  event: { name: "Garden wedding", organizerId: "host1", templateId: "t1" },
  ...over,
});

beforeEach(() => {
  Object.values(db).forEach((f) => f.mockReset());
  db.findById.mockResolvedValue(booking());
  db.cancel.mockResolvedValue({ id: "b1", status: "cancelled" });
  db.getBookingPayments.mockResolvedValue([]);
  db.release.mockResolvedValue(undefined);
  db.notify.mockResolvedValue({});
  db.record.mockResolvedValue(undefined);
  db.assetFind.mockResolvedValue([{ providerId: "prov1" }]);
  db.serviceFind.mockResolvedValue([{ providerId: "prov2" }]);
  db.venueFind.mockResolvedValue([{ providerId: "mayor1" }]);
});

describe("BookingHostDeclineSvc.decline", () => {
  it("cancels an unpaid booking, frees every Supplier slot, and syncs the event", async () => {
    const out = await BookingHostDeclineSvc.decline("b1", "host1", "busy");

    expect(out).toEqual({ id: "b1", status: "cancelled" });
    expect(db.cancel).toHaveBeenCalledWith("b1");
    for (const update of [db.assetUpdate, db.serviceUpdate, db.venueUpdate]) {
      expect(update).toHaveBeenCalledWith({
        where: expect.objectContaining({ bookingId: "b1" }),
        data: { status: "cancelled" },
      });
    }
    expect(db.sync).toHaveBeenCalledWith("e1");
    expect(db.release).toHaveBeenCalledWith({ eventId: "e1" });
    expect(db.record).toHaveBeenCalledWith(
      "host1",
      "booking.host_declined",
      "t1",
      { bookingId: "b1", cause: "busy" },
    );
  });

  it("only frees rows that are still holding a slot", async () => {
    await BookingHostDeclineSvc.decline("b1", "host1");

    const where = db.assetUpdate.mock.calls[0][0].where;
    expect(where.status.in).toEqual([
      "pending_provider_confirmation",
      "pending",
      "approved",
    ]);
  });

  it("tells the citizen, with the cause, and each Supplier once", async () => {
    db.serviceFind.mockResolvedValue([{ providerId: "prov1" }]);

    await BookingHostDeclineSvc.decline("b1", "host1", "busy");

    const sent = db.notify.mock.calls.map((c) => c[0]);
    const citizen = sent.find((n) => n.userId === "citizen1");
    expect(citizen.message).toContain("busy with another event");
    expect(citizen.message).toContain("Nothing was charged");
    expect(citizen.metadata.link).toBe("/bookings/b1");
    expect(sent.filter((n) => n.userId === "prov1")).toHaveLength(1);
    expect(sent.some((n) => n.userId === "mayor1")).toBe(true);
    expect(sent.some((n) => n.userId === "host1")).toBe(false);
  });

  it("cancels an open payment intent on an unpaid booking", async () => {
    db.getBookingPayments.mockResolvedValue([
      { id: "p1", status: "pending", providerReference: "pi_123" },
      { id: "p2", status: "paid", providerReference: "pi_999" },
    ]);

    await BookingHostDeclineSvc.decline("b1", "host1");

    expect(db.stripeCancel).toHaveBeenCalledTimes(1);
    expect(db.stripeCancel).toHaveBeenCalledWith("pi_123");
    expect(db.markPaymentCancelled).toHaveBeenCalledWith("p1");
  });

  it("refuses anyone but the event's host", async () => {
    await expect(
      BookingHostDeclineSvc.decline("b1", "citizen1"),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.cancel).not.toHaveBeenCalled();
    expect(db.assetUpdate).not.toHaveBeenCalled();
  });

  it("refuses once the booking is paid", async () => {
    db.findById.mockResolvedValue(booking({ status: "confirmed" }));

    await expect(
      BookingHostDeclineSvc.decline("b1", "host1"),
    ).rejects.toMatchObject({ status: 409, code: "DECLINE_AFTER_PAYMENT" });
    expect(db.cancel).not.toHaveBeenCalled();
  });

  it("refuses a booking that is already cancelled, and one that is not found", async () => {
    db.findById.mockResolvedValue(booking({ status: "cancelled" }));
    await expect(
      BookingHostDeclineSvc.decline("b1", "host1"),
    ).rejects.toMatchObject({ status: 409 });

    db.findById.mockResolvedValue(null);
    await expect(
      BookingHostDeclineSvc.decline("b1", "host1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("does not fail the decline when a notification cannot be sent", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.notify.mockRejectedValue(new Error("socket down"));

    const out = await BookingHostDeclineSvc.decline("b1", "host1");

    expect(out).toEqual({ id: "b1", status: "cancelled" });
    spy.mockRestore();
  });
});
