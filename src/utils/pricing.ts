import { BillingRate, Prisma } from "@prisma/client";

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

/**
 * Number of full billing periods spanned between two dates for a given
 * BillingRate. Always at least 1 — a booking always charges for at least one
 * period, even same-day. `one_time` ignores duration entirely.
 *
 * `monthly`/`yearly` use a fixed 30/365-day approximation since there's no
 * calendar-aware billing elsewhere in this codebase to match.
 */
export function calculateBillingPeriods(
  startDate: Date,
  endDate: Date,
  billingRate: BillingRate,
): number {
  if (billingRate === BillingRate.one_time) return 1;

  const spanMs = Math.max(0, endDate.getTime() - startDate.getTime());

  switch (billingRate) {
    case BillingRate.hourly:
      return Math.max(1, Math.ceil(spanMs / MS_PER_HOUR));
    case BillingRate.daily:
      return Math.max(1, Math.ceil(spanMs / MS_PER_DAY));
    case BillingRate.weekly:
      return Math.max(1, Math.ceil(spanMs / (MS_PER_DAY * 7)));
    case BillingRate.monthly:
      return Math.max(1, Math.ceil(spanMs / (MS_PER_DAY * 30)));
    case BillingRate.yearly:
      return Math.max(1, Math.ceil(spanMs / (MS_PER_DAY * 365)));
    default:
      return 1;
  }
}

/** A peso amount as the integer minor-unit value the Stripe API expects. */
export function toStripeCents(amount: number): number {
  return Math.round(amount * 100);
}

/** A peso amount for display, e.g. "PHP 1234.50". No thousands separator. */
export function formatCurrency(amount: number | Prisma.Decimal): string {
  return `PHP ${amount.toFixed(2)}`;
}

/** itemsTotal for a direct Asset/Service booking: price * quantity * periods spanned. */
export function calculateItemsTotal(params: {
  price: number;
  quantity: number;
  startDate: Date;
  endDate: Date;
  billingRate: BillingRate;
}): number {
  const periods = calculateBillingPeriods(
    params.startDate,
    params.endDate,
    params.billingRate,
  );
  return params.price * params.quantity * periods;
}
