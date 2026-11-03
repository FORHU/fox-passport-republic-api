import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * #142 (BUG-07): `GET /bookings/user/:userId` returned whoever's bookings the
 * path named, to anyone signed in. The web asked with a stale stored id after
 * an account switch, and got the previous account's list. The session decides
 * now, as on GET /asset/bookings and /service/bookings.
 */

vi.mock("../src/modules/booking/booking.service", () => ({
  default: {
    getUserBookings: vi.fn(async () => ({
      bookings: [{ id: "bk1" }],
      total: 1,
    })),
  },
}));

import BookingCtrl from "../src/modules/booking/booking.controller";
import BookingSvc from "../src/modules/booking/booking.service";

function call(
  pathUserId: string,
  viewer: { userId: string; systemRole: string },
) {
  const req = {
    params: { userId: pathUserId },
    query: {},
    user: { ...viewer, email: "x@example.com", roleType: [] },
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  return BookingCtrl.getUserBookings(req, res).then(() => res);
}

beforeEach(() => vi.clearAllMocks());

describe("BookingCtrl.getUserBookings", () => {
  it("refuses someone else's id, and reads nothing", async () => {
    const res = await call("alice", { userId: "bea", systemRole: "user" });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "You can only list your own bookings",
    });
    expect(BookingSvc.getUserBookings).not.toHaveBeenCalled();
  });

  it("lists the caller's own bookings", async () => {
    const res = await call("bea", { userId: "bea", systemRole: "user" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(BookingSvc.getUserBookings).toHaveBeenCalledWith("bea", 1, 4);
  });

  it("lets an admin list anyone's", async () => {
    const res = await call("alice", { userId: "root", systemRole: "admin" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(BookingSvc.getUserBookings).toHaveBeenCalledWith("alice", 1, 4);
  });
});
