import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookingStatus } from "@prisma/client";

/**
 * The reminder sweep runs on an in-process cron, so every API instance runs it
 * at the same moment. Idempotency was tracked on the booking row, but the check
 * and the write were not one step: read `reminderSentAt` as null, send, then
 * mark. Two instances interleave that trivially and the user gets the
 * notification twice.
 *
 * The claim is now the race winner - `updateMany` with the null in the `where`
 * matches one row or none - and the loser sends nothing.
 */

const calls = vi.hoisted(() => ({ order: [] as string[] }));

const repo = vi.hoisted(() => ({
  findUpcomingNeedingReminder: vi.fn(),
  claimReminders: vi.fn(),
  findOverdueUnpaid: vi.fn(async () => []),
  updateStatus: vi.fn(),
}));

const notifications = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("../src/modules/booking/booking.repository", () => ({ default: repo }));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: notifications,
}));

import BookingReminderService from "../src/modules/booking/booking-reminder.service";

const BOOKING = {
  id: "booking-1",
  userId: "user-1",
  status: BookingStatus.pending,
  reminderSentAt: null,
  paymentReminderSentAt: null,
  event: { id: "event-1", name: "Fox Night" },
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.order.length = 0;
  repo.findUpcomingNeedingReminder.mockResolvedValue([BOOKING]);
  repo.findOverdueUnpaid.mockResolvedValue([]);
  repo.claimReminders.mockImplementation(async () => {
    calls.order.push("claim");
    return { reminder: true, paymentReminder: true };
  });
  notifications.create.mockImplementation(async () => {
    calls.order.push("notify");
    return {};
  });
});

describe("the reminder claim", () => {
  it("sends nothing when another instance won the row", async () => {
    repo.claimReminders.mockResolvedValue({
      reminder: false,
      paymentReminder: false,
    });

    await BookingReminderService.runSweep();

    expect(repo.claimReminders).toHaveBeenCalledTimes(1);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("sends only the half it won", async () => {
    // The two flags are claimed independently, so one instance can win the
    // reminder while another wins the payment nudge.
    repo.claimReminders.mockResolvedValue({
      reminder: true,
      paymentReminder: false,
    });

    await BookingReminderService.runSweep();

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({
      type: "BOOKING_REMINDER",
    });
  });

  it("claims before notifying, not after", async () => {
    // The ordering is the whole fix. Marking after sending is what let both
    // instances send.
    await BookingReminderService.runSweep();

    expect(calls.order[0]).toBe("claim");
    expect(calls.order).toContain("notify");
  });

  it("sends both when it won both", async () => {
    await BookingReminderService.runSweep();

    expect(notifications.create).toHaveBeenCalledTimes(2);
    const types = notifications.create.mock.calls.map((c) => c[0].type);
    expect(types).toEqual(["BOOKING_REMINDER", "PAYMENT_REMINDER"]);
  });

  it("does not claim a row that needs nothing", async () => {
    repo.findUpcomingNeedingReminder.mockResolvedValue([
      {
        ...BOOKING,
        reminderSentAt: new Date(),
        status: BookingStatus.confirmed,
      },
    ]);

    await BookingReminderService.runSweep();

    expect(repo.claimReminders).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
