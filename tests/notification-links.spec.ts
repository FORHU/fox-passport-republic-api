import { describe, it, expect } from "vitest";
import {
  bookingLink,
  bookingsListLink,
  invoiceRefundLink,
  partnershipsLink,
} from "../src/utils/notification-links";

/**
 * app#383: clicking a "Booking confirmed" notification opened the 404 page,
 * because the stored link was `/bookings/:id` and the web app's page is
 * `/booking/:id`. `/partnerships/:id` and `/invoices/:id` had no page either.
 *
 * Every path below is one the web app really serves, so a link that points at
 * nothing fails here instead of in front of a user.
 */

/** The page routes `notificationLink` may send a user to, from `src/app/`. */
const WEB_ROUTES: RegExp[] = [
  /^\/booking\/[^/]+$/, // app/booking/[id]
  /^\/booking$/, // app/booking
  /^\/creator-dashboard\/partnerships$/, // app/creator-dashboard/partnerships
];

const isServed = (path: string) => WEB_ROUTES.some((re) => re.test(path));

describe("notification links", () => {
  it("links a booking to the booking page, not /bookings/:id", () => {
    expect(bookingLink("b1")).toBe("/booking/b1");
  });

  it("links a partnership notification to the partnerships dashboard", () => {
    expect(partnershipsLink()).toBe("/creator-dashboard/partnerships");
  });

  it("names the booking when an invoice paid for one", () => {
    expect(invoiceRefundLink({ sourceType: "booking", sourceId: "b9" })).toBe(
      "/booking/b9",
    );
  });

  it("names the partnerships dashboard when an invoice paid a sponsorship", () => {
    expect(
      invoiceRefundLink({ sourceType: "sponsorship", sourceId: "p1" }),
    ).toBe("/creator-dashboard/partnerships");
  });

  it.each([
    "event_asset_transaction",
    "event_service_transaction",
    "event_venue_transaction",
  ] as const)(
    "falls back to the bookings list for a %s invoice line",
    (sourceType) => {
      expect(invoiceRefundLink({ sourceType, sourceId: "t1" })).toBe(
        bookingsListLink(),
      );
    },
  );

  it("only ever produces a path the web app serves", () => {
    const links = [
      bookingLink("b1"),
      partnershipsLink(),
      bookingsListLink(),
      invoiceRefundLink({ sourceType: "booking", sourceId: "b1" }),
      invoiceRefundLink({ sourceType: "sponsorship", sourceId: "p1" }),
      invoiceRefundLink({
        sourceType: "event_venue_transaction",
        sourceId: "t1",
      }),
    ];
    for (const link of links) expect(isServed(link), link).toBe(true);
  });
});
