import BookingRepo from "./booking.repository";
import NotificationService from "../notifications/user-notification.service";
import { BookingStatus } from "@prisma/client";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export default class BookingReminderService {
  /**
   * Runs on a schedule (see jobs/booking-reminders.job.ts). Three passes:
   *  1. Reminder + payment-nudge notifications for bookings starting within 24h.
   *  2. Auto-cancel bookings that stayed unpaid past their own start time.
   * Idempotency is tracked on the booking itself (reminderSentAt /
   * paymentReminderSentAt) rather than by scanning the Notification table, so a
   * missed or overlapping tick never double-sends.
   */
  static async runSweep() {
    const now = new Date();
    await this.sendUpcomingReminders(now);
    await this.cancelOverdueUnpaid(now);
  }

  private static async sendUpcomingReminders(now: Date) {
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
    const bookings = await BookingRepo.findUpcomingNeedingReminder(
      now,
      windowEnd,
    );

    for (const booking of bookings) {
      const eventName = booking.event?.name ?? "your event";
      const needsReminder = !booking.reminderSentAt;
      const needsPaymentNudge =
        booking.status === BookingStatus.pending &&
        !booking.paymentReminderSentAt;

      if (needsReminder) {
        await NotificationService.create({
          userId: booking.userId,
          type: "BOOKING_REMINDER",
          title: "Upcoming booking",
          message: `${eventName} is coming up in less than 24 hours.`,
          metadata: { link: `/booking/${booking.id}` },
        }).catch((e) =>
          console.error(
            `Failed to create reminder notification for booking ${booking.id}`,
            e,
          ),
        );
      }

      if (needsPaymentNudge) {
        await NotificationService.create({
          userId: booking.userId,
          type: "PAYMENT_REMINDER",
          title: "Payment still needed",
          message: `${eventName} starts soon and this booking hasn't been paid yet. Complete payment to keep your spot.`,
          metadata: { link: `/booking/${booking.id}` },
        }).catch((e) =>
          console.error(
            `Failed to create payment reminder for booking ${booking.id}`,
            e,
          ),
        );
      }

      if (needsReminder || needsPaymentNudge) {
        await BookingRepo.markReminderSent(booking.id, {
          reminder: needsReminder,
          paymentReminder: needsPaymentNudge,
        });
      }
    }

    return bookings.length;
  }

  private static async cancelOverdueUnpaid(now: Date) {
    const overdue = await BookingRepo.findOverdueUnpaid(now);

    for (const booking of overdue) {
      const eventName = booking.event?.name ?? "your event";

      await BookingRepo.updateStatus(booking.id, BookingStatus.cancelled);

      await NotificationService.create({
        userId: booking.userId,
        type: "BOOKING_AUTO_CANCELLED",
        title: "Booking cancelled",
        message: `Your booking for ${eventName} was cancelled because payment wasn't completed before the event started.`,
        metadata: { link: `/booking/${booking.id}` },
      }).catch((e) =>
        console.error(
          `Failed to create auto-cancel notification for booking ${booking.id}`,
          e,
        ),
      );
    }

    return overdue.length;
  }
}
