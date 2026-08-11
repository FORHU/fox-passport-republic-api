import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the DB-backed repo and the Stripe-backed services so this unit test
// needs no live database or Stripe credentials.
vi.mock("../src/repositories/booking.repository", () => ({
  default: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../src/services/payout.service", () => ({
  default: { createPayoutsForEventBooking: vi.fn() },
}));

vi.mock("../src/services/payment.service", () => ({
  default: class {},
}));

import BookingSvc from "../src/services/booking.service";
import BookingRepo from "../src/repositories/booking.repository";

describe("BookingSvc.checkInAndSettle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("settles a confirmed booking and triggers the payout", async () => {
    const confirmed = {
      id: "b1",
      status: "confirmed",
      checkedIn: false,
      event: { organizerId: "host1" },
    };
    const settled = {
      ...confirmed,
      status: "completed",
      checkedIn: true,
    };
    (BookingRepo.findById as any)
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(settled);
    (BookingRepo.update as any).mockResolvedValue({});
    const updateStatusSpy = vi
      .spyOn(BookingSvc, "updateStatus")
      .mockResolvedValue({} as any);

    const result = await BookingSvc.checkInAndSettle("b1", "host1");

    expect(BookingRepo.update).toHaveBeenCalledWith("b1", { checkedIn: true });
    expect(updateStatusSpy).toHaveBeenCalledWith("b1", "completed", "host1");
    expect(result.payoutTriggered).toBe(true);
  });

  it("rejects a scanner who is not the host", async () => {
    (BookingRepo.findById as any).mockResolvedValue({
      id: "b1",
      status: "confirmed",
      event: { organizerId: "host1" },
    });

    await expect(
      BookingSvc.checkInAndSettle("b1", "someone-else"),
    ).rejects.toThrow(/not the host/);
  });

  it("rejects an unpaid (pending) booking", async () => {
    (BookingRepo.findById as any).mockResolvedValue({
      id: "b1",
      status: "pending",
      event: { organizerId: "host1" },
    });

    await expect(BookingSvc.checkInAndSettle("b1", "host1")).rejects.toThrow(
      /not confirmed\/paid/,
    );
  });

  it("rejects a cancelled booking", async () => {
    (BookingRepo.findById as any).mockResolvedValue({
      id: "b1",
      status: "cancelled",
      event: { organizerId: "host1" },
    });

    await expect(BookingSvc.checkInAndSettle("b1", "host1")).rejects.toThrow(
      /not confirmed\/paid/,
    );
  });

  it("is idempotent for an already completed booking", async () => {
    (BookingRepo.findById as any).mockResolvedValue({
      id: "b1",
      status: "completed",
      event: { organizerId: "host1" },
    });
    const updateStatusSpy = vi.spyOn(BookingSvc, "updateStatus");

    const result = await BookingSvc.checkInAndSettle("b1", "host1");

    expect(updateStatusSpy).not.toHaveBeenCalled();
    expect(result.payoutTriggered).toBe(false);
    expect(result.alreadySettled).toBe(true);
  });
});
