import { AppError } from "./errors";

/** The longest booking, in days, a venue or package can be booked for. */
export const MAX_BOOKING_DAYS = 60;

/**
 * How many days a venue or package booking is priced for: each started 24
 * hours counts. The apps book a package from 18:00 on the first day to
 * midnight after the last, so one evening is 1 and 20–22 Nov is 3; a venue
 * from the first day's start to the last day's 23:59:59.
 *
 * Refuses an end that isn't after the start, and anything over
 * MAX_BOOKING_DAYS.
 */
export function bookingDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (!(ms > 0)) throw new AppError("The end must be after the start", 400);
  const days = Math.ceil(ms / 86_400_000);
  if (days > MAX_BOOKING_DAYS) {
    throw new AppError(
      `A booking can be at most ${MAX_BOOKING_DAYS} days long.`,
      400,
      "BOOKING_TOO_LONG",
    );
  }
  return days;
}
