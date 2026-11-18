/**
 * Blocked days are a calendar of days, not moments: a Mayor blocks "Dec 5",
 * stored as midnight. So a booking is held up by one when any day it touches
 * is blocked, however late in that day it starts.
 *
 * Comparing the timestamps instead (`blocked >= start && blocked < end`) let a
 * booking that starts at 18:00 on a day blocked at 00:00 through, because the
 * blocked moment is before the start. Days are keyed the way the rest of the
 * booking code keys them (`dayKey`, the UTC date).
 */

export const dayKey = (d: Date): string => d.toISOString().split("T")[0];

/**
 * Whether any blocked day falls on a day of `start` up to `end`. `end` is the
 * moment the booking finishes, so one that ends exactly at midnight does not
 * touch the next day. A range that is empty or backwards still counts its
 * start day.
 */
export function blockedDayHitsRange(
  blocked: Date[],
  start: Date,
  end: Date,
): boolean {
  const first = dayKey(start);
  const last = dayKey(new Date(Math.max(end.getTime() - 1, start.getTime())));
  return blocked.some((d) => {
    const key = dayKey(d);
    return key >= first && key <= last;
  });
}
