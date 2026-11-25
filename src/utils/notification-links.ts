import type { InvoiceSourceType } from "@prisma/client";

/**
 * Where a notification sends the user, as an app-relative path stored in
 * `notifications.metadata.link`. The web app and the mobile app follow it as
 * written, so every path here has to be a route the web app really has
 * (app#383: `/bookings/:id`, `/partnerships/:id` and `/invoices/:id` were not,
 * and opened the 404 page).
 *
 * Keep the shapes in this one file instead of writing a template string at each
 * `NotificationService.create` call.
 */

/** The booking page. Guests and hosts share it (`/host/bookings/:id` redirects here). */
export const bookingLink = (bookingId: string): string =>
  `/booking/${bookingId}`;

/**
 * The partnerships dashboard. It lists proposals and has no page per proposal,
 * so a sponsorship notification lands on the list.
 */
export const partnershipsLink = (): string => "/creator-dashboard/partnerships";

/** The user's bookings. Used when an invoice names nothing more specific. */
export const bookingsListLink = (): string => "/booking";

/**
 * Where a refund of an invoice line leads. The web app has no invoice page, so
 * the link names the thing the invoice paid for: the booking, or the
 * sponsorship. Any other source (an Event's per-supplier lines have no page of
 * their own) falls back to the bookings list.
 */
export function invoiceRefundLink(item: {
  sourceType: InvoiceSourceType;
  sourceId: string;
}): string {
  switch (item.sourceType) {
    case "booking":
      return bookingLink(item.sourceId);
    case "sponsorship":
      return partnershipsLink();
    default:
      return bookingsListLink();
  }
}

/**
 * A Supplier's requests and bookings (Marketplace Requests), where they
 * confirm, reject or decline a line on a booked event.
 */
export const providerRequestsLink = (): string => "/foxer/marketplace-requests";
