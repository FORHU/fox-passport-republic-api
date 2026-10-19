import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * `refundInFull` is the one refund path for a customer who is not at fault -
 * a provider cancellation or a dispute ruled their way - so it pins the amount
 * and the record the admin refunds queue reads.
 */

const stripeRefund = vi.hoisted(() => vi.fn());
const refundCreate = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("stripe", () => ({
  default: class {
    refunds = { create: stripeRefund };
  },
}));

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));

vi.mock("../src/utils/prisma", () => ({
  connectToPrisma: vi.fn(async () => {}),
  prisma: { refund: { create: refundCreate } },
}));

import AssetBookingSvc from "../src/modules/asset-booking/asset-booking.service";

const paid = {
  id: "b1",
  paymentStatus: "paid",
  paymentTransactionId: "pi_123",
  totalAmount: new Prisma.Decimal("150.50"),
} as const;

beforeEach(() => vi.clearAllMocks());

describe("AssetBookingSvc.refundInFull", () => {
  it("refunds the whole amount through Stripe and records it", async () => {
    stripeRefund.mockResolvedValue({ id: "re_1", status: "succeeded" });

    await AssetBookingSvc.refundInFull(paid as never, "why");

    expect(stripeRefund).toHaveBeenCalledWith({
      payment_intent: "pi_123",
      amount: 15050,
    });
    expect(refundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetBookingId: "b1",
        providerReference: "re_1",
        status: "succeeded",
        reason: "why",
      }),
    });
  });

  it("records a failed refund instead of throwing when Stripe fails", async () => {
    stripeRefund.mockRejectedValue(new Error("stripe down"));

    await AssetBookingSvc.refundInFull(paid as never, "why");

    expect(refundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetBookingId: "b1", status: "failed" }),
    });
  });

  it("does nothing for an unpaid booking", async () => {
    await AssetBookingSvc.refundInFull(
      { ...paid, paymentStatus: "pending" } as never,
      "why",
    );

    expect(stripeRefund).not.toHaveBeenCalled();
    expect(refundCreate).not.toHaveBeenCalled();
  });
});
