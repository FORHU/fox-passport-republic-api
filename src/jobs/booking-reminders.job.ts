import cron from "node-cron";
import BookingReminderService from "../modules/booking/booking-reminder.service";

/**
 * Every 15 minutes: notify users about bookings starting within 24h (plus a
 * payment nudge if still unpaid), and auto-cancel bookings that never got
 * paid before their event started. See BookingReminderService.runSweep.
 */
export function scheduleBookingReminders() {
  cron.schedule("*/15 * * * *", () => {
    BookingReminderService.runSweep().catch((e) =>
      console.error("Booking reminder sweep failed", e),
    );
  });
}
