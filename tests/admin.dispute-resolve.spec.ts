import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Resolving a dispute used to update the booking by id alone, so a resolve
 * call could mark any booking `completed` - and, since PR #109, pay the
 * provider for it. It now matches only a booking that is actually `disputed`.
 *
 * A ruling for the customer used to change the status and nothing else; it now
 * refunds them in full, the same way a provider cancellation does.
 */

const db = vi.hoisted(() => ({
  bookings: new Map<string, { id: string; status: string; userId: string }>(),
}));

const payouts = vi.hoisted(() => ({
  createPayoutsForAssetBooking: vi.fn(async () => {}),
}));

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));

const refunds = vi.hoisted(() => ({ refundInFull: vi.fn(async () => {}) }));

vi.mock("../src/modules/payout/payout.service", () => ({ default: payouts }));
vi.mock("../src/modules/asset-booking/asset-booking.service", () => ({
  default: refunds,
}));

vi.mock("../src/utils/prisma", () => ({
  connectToPrisma: vi.fn(async () => {}),
  prisma: {
    assetBooking: {
      // Behaves like Prisma: a `where` that matches nothing throws P2025.
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: string };
          data: { status: string };
        }) => {
          const row = db.bookings.get(where.id);
          if (!row || (where.status && row.status !== where.status)) {
            throw new Prisma.PrismaClientKnownRequestError("not found", {
              code: "P2025",
              clientVersion: "test",
            });
          }
          row.status = data.status;
          return { ...row, asset: { ownerId: "owner-1" } };
        },
      ),
    },
  },
}));

import AdminSvc from "../src/modules/admin/admin.service";

beforeEach(() => {
  vi.clearAllMocks();
  db.bookings.clear();
});

describe("resolveAssetBookingDispute", () => {
  it("pays the provider when a disputed booking is resolved in their favor", async () => {
    db.bookings.set("b1", { id: "b1", status: "disputed", userId: "u1" });

    await AdminSvc.resolveAssetBookingDispute("b1", "completed");

    expect(db.bookings.get("b1")?.status).toBe("completed");
    expect(payouts.createPayoutsForAssetBooking).toHaveBeenCalledWith("b1");
    expect(refunds.refundInFull).not.toHaveBeenCalled();
  });

  it("refunds the customer in full when the dispute goes their way", async () => {
    db.bookings.set("b3", { id: "b3", status: "disputed", userId: "u1" });

    await AdminSvc.resolveAssetBookingDispute("b3", "cancelled");

    expect(db.bookings.get("b3")?.status).toBe("cancelled");
    expect(refunds.refundInFull).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b3" }),
      "Dispute resolved in the customer's favor",
    );
    expect(payouts.createPayoutsForAssetBooking).not.toHaveBeenCalled();
  });

  it("refuses a booking that was never disputed, and pays nothing", async () => {
    db.bookings.set("b2", { id: "b2", status: "confirmed", userId: "u1" });

    await expect(
      AdminSvc.resolveAssetBookingDispute("b2", "completed"),
    ).rejects.toMatchObject({ code: "P2025" });

    expect(db.bookings.get("b2")?.status).toBe("confirmed");
    expect(payouts.createPayoutsForAssetBooking).not.toHaveBeenCalled();
    expect(refunds.refundInFull).not.toHaveBeenCalled();
  });
});
