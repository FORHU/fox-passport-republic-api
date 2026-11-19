import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A booking can't be paid while any Supplier is still to answer: a venue over
 * capacity, gear or a service added to the booking, a replacement, or an
 * unmatched Supplier asked first (ADR 0010).
 */

const m = vi.hoisted(() => ({
  createIntent: vi.fn(),
  venue: vi.fn(),
  asset: vi.fn(),
  service: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { create: m.createIntent };
  },
}));
vi.mock("../src/utils/prisma", () => ({
  prisma: {
    eventVenueTransaction: { findFirst: m.venue },
    eventAssetTransaction: { findFirst: m.asset },
    eventServiceTransaction: { findFirst: m.service },
  },
}));

import PaymentSvc from "../src/modules/payment/payment.service";

const pay = () =>
  PaymentSvc.createPaymentIntent({ amount: 1000, bookingId: "b1" });

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.venue.mockResolvedValue(null);
  m.asset.mockResolvedValue(null);
  m.service.mockResolvedValue(null);
  m.createIntent.mockResolvedValue({ client_secret: "cs", id: "pi_1" });
});

describe("paying a booking with Suppliers still to answer", () => {
  it("is refused while gear is awaiting its Supplier", async () => {
    m.asset.mockResolvedValue({ id: "a1" });

    await expect(pay()).rejects.toMatchObject({
      status: 409,
      code: "AWAITING_SUPPLIERS",
    });
    expect(m.createIntent).not.toHaveBeenCalled();
    expect(m.asset.mock.calls[0][0].where).toEqual({
      bookingId: "b1",
      status: "pending_provider_confirmation",
      included: true,
    });
  });

  it("is refused while a service is awaiting its Supplier", async () => {
    m.service.mockResolvedValue({ id: "s1" });

    await expect(pay()).rejects.toMatchObject({ status: 409 });
  });

  it("is refused while the venue is awaiting its Mayor, as before", async () => {
    m.venue.mockResolvedValue({ id: "v1" });

    await expect(pay()).rejects.toMatchObject({ status: 400 });
  });

  it("goes ahead once nothing is waiting", async () => {
    await expect(pay()).resolves.toEqual({
      clientSecret: "cs",
      paymentIntentId: "pi_1",
    });
  });
});
