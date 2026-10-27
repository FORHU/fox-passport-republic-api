import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookingStatus } from "@prisma/client";

/**
 * Two sweeps cancel bookings without passing through BookingSvc: payments left
 * pending past their window, and bookings still unpaid when their event
 * starts. Neither re-derived the Event's status, so an Event whose bookings
 * had all lapsed stayed `pending` instead of following them to `cancelled`.
 */

const eventRequest = vi.hoisted(() => ({
  syncStatusFromBookings: vi.fn(async () => undefined),
}));
vi.mock("../src/modules/event-request/event-request.service", () => ({
  default: eventRequest,
}));

const paymentRepo = vi.hoisted(() => ({ cancelExpiredPayments: vi.fn() }));
vi.mock("../src/modules/payment/payment.repository", () => ({
  default: paymentRepo,
  PENDING_PAYMENT_TTL_MS: 0,
}));

const bookingRepo = vi.hoisted(() => ({
  findUpcomingNeedingReminder: vi.fn(async () => []),
  findOverdueUnpaid: vi.fn(),
  updateStatus: vi.fn(),
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: bookingRepo,
}));

vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn(async () => ({})) },
}));
vi.mock("../src/utils/cache-namespaces", () => ({
  bookingCache: { invalidateAll: vi.fn() },
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
import BookingReminderService from "../src/modules/booking/booking-reminder.service";

beforeEach(() => {
  vi.clearAllMocks();
  bookingRepo.findOverdueUnpaid.mockResolvedValue([]);
});

describe("Event status after an expiry sweep", () => {
  it("re-syncs each Event whose payment window closed", async () => {
    paymentRepo.cancelExpiredPayments.mockResolvedValue({
      cancelled: 2,
      eventIds: ["e1", "e2"],
    });

    await PaymentSvc.sweepExpiredPayments();

    expect(eventRequest.syncStatusFromBookings.mock.calls).toEqual([
      ["e1"],
      ["e2"],
    ]);
  });

  it("syncs nothing when nothing expired", async () => {
    paymentRepo.cancelExpiredPayments.mockResolvedValue({
      cancelled: 0,
      eventIds: [],
    });

    await PaymentSvc.sweepExpiredPayments();

    expect(eventRequest.syncStatusFromBookings).not.toHaveBeenCalled();
  });

  it("re-syncs the Event of a booking cancelled for staying unpaid", async () => {
    bookingRepo.findOverdueUnpaid.mockResolvedValue([
      {
        id: "b1",
        userId: "u1",
        eventId: "e1",
        status: BookingStatus.pending,
        event: { id: "e1", name: "Fox Night" },
      },
    ]);

    await BookingReminderService.runSweep();

    expect(bookingRepo.updateStatus).toHaveBeenCalledWith(
      "b1",
      BookingStatus.cancelled,
    );
    expect(eventRequest.syncStatusFromBookings).toHaveBeenCalledWith("e1");
  });
});
