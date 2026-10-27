import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * An admin settles each booking of an Event flagged for review (it ended and
 * nobody was checked in). Attended goes through what check-in does - payout,
 * stamp, the Event's status - and no-show cancels with no refund. The write
 * is a claim, so a second attempt runs none of it again.
 */

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  settleForReview: vi.fn(async () => true),
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: repo,
}));

const payouts = vi.hoisted(() => ({ createPayoutsForEventBooking: vi.fn() }));
vi.mock("../src/modules/payout/payout.service", () => ({ default: payouts }));

const passport = vi.hoisted(() => ({
  issueStamp: vi.fn(),
  awardXP: vi.fn(),
}));
vi.mock("../src/modules/passport/passport.service", () => ({
  default: passport,
  XP_REWARDS: {},
  UserPath: {},
}));

const eventRequest = vi.hoisted(() => ({ syncStatusFromBookings: vi.fn() }));
vi.mock("../src/modules/event-request/event-request.service", () => ({
  default: eventRequest,
}));

const organizerXp = vi.hoisted(() => ({ onGuestCheckedIn: vi.fn() }));
vi.mock("../src/modules/appointment/organizer-xp.service", () => ({
  default: organizerXp,
}));

const refunds = vi.hoisted(() => ({ computeRefund: vi.fn() }));
vi.mock("../src/modules/refund/refund.service", () => ({ default: refunds }));

const notifications = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: notifications,
}));

const audit = vi.hoisted(() => ({ recordChangeBy: vi.fn(async () => {}) }));
vi.mock("../src/modules/audit/audit.service", () => audit);

vi.mock("../src/modules/payment/payment.service", () => ({
  default: class {},
}));
vi.mock("../src/utils/prisma", () => ({
  prisma: { eventVenueTransaction: { findFirst: vi.fn(async () => null) } },
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged: vi.fn(),
  announceToAdmins: vi.fn(),
  announceToUser: vi.fn(),
}));

import BookingSvc from "../src/modules/booking/booking.service";

const BOOKING = {
  id: "b1",
  userId: "guest",
  eventId: "e1",
  status: "confirmed",
  checkedIn: false,
  event: {
    id: "e1",
    name: "Fox Night",
    organizerId: "foxer",
    templateId: "t1",
    reviewFlaggedAt: new Date("2026-10-28T01:00:00Z"),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(structuredClone(BOOKING));
  repo.settleForReview.mockResolvedValue(true);
});

describe("BookingSvc.settleForReview", () => {
  it("settles an attended booking as check-in does", async () => {
    await BookingSvc.settleForReview("b1", "attended", "admin");

    expect(repo.settleForReview).toHaveBeenCalledWith("b1", true);
    expect(payouts.createPayoutsForEventBooking).toHaveBeenCalledWith("b1");
    expect(passport.issueStamp).toHaveBeenCalledWith("b1");
    expect(eventRequest.syncStatusFromBookings).toHaveBeenCalledWith("e1");
    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "admin",
      "booking.checkedIn",
      "t1",
      { bookingId: "b1", byReview: true },
    );
    // No Organizer checked anyone in, so none earns for it.
    expect(organizerXp.onGuestCheckedIn).not.toHaveBeenCalled();
  });

  it("cancels a no-show with no refund, payout or stamp", async () => {
    await BookingSvc.settleForReview("b1", "noShow", "admin");

    expect(repo.settleForReview).toHaveBeenCalledWith("b1", false);
    expect(eventRequest.syncStatusFromBookings).toHaveBeenCalledWith("e1");
    expect(payouts.createPayoutsForEventBooking).not.toHaveBeenCalled();
    expect(passport.issueStamp).not.toHaveBeenCalled();
    expect(refunds.computeRefund).not.toHaveBeenCalled();
    expect(audit.recordChangeBy).toHaveBeenCalledWith(
      "admin",
      "booking.cancelled",
      "t1",
      { bookingId: "b1", noShow: true },
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "guest", type: "BOOKING_NO_SHOW" }),
    );
  });

  it("runs nothing a second time once the booking is settled", async () => {
    repo.settleForReview.mockResolvedValue(false);

    await expect(
      BookingSvc.settleForReview("b1", "attended", "admin"),
    ).rejects.toThrow(/already settled/);
    expect(payouts.createPayoutsForEventBooking).not.toHaveBeenCalled();
    expect(eventRequest.syncStatusFromBookings).not.toHaveBeenCalled();
    expect(audit.recordChangeBy).not.toHaveBeenCalled();
  });

  it("refuses a booking whose event was never flagged", async () => {
    repo.findById.mockResolvedValue({
      ...structuredClone(BOOKING),
      event: { ...BOOKING.event, reviewFlaggedAt: null },
    });

    await expect(
      BookingSvc.settleForReview("b1", "noShow", "admin"),
    ).rejects.toThrow(/not flagged/);
    expect(repo.settleForReview).not.toHaveBeenCalled();
  });
});
