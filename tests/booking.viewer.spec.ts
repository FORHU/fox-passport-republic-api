import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `GET /bookings/:id` used to hand any booking - guest list, payments and
 * all - to anyone holding its id, signed in or not. `getBookingForViewer` is
 * the door now; these pin who gets through it and that everyone else sees
 * the same "not found" a missing booking gives.
 */

const access = vi.hoisted(() => ({
  canOnEvent: vi.fn(async () => false),
  canOnVenue: vi.fn(async () => false),
}));

vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: access,
}));

import BookingSvc from "../src/modules/booking/booking.service";

const BOOKING = {
  id: "b1",
  userId: "guest",
  eventId: "e1",
  event: { host: { id: "owner" } },
  attendees: [{ userId: "friend", isDraft: false }],
  venueTransactions: [{ venueId: "v1" }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  access.canOnEvent.mockResolvedValue(false);
  access.canOnVenue.mockResolvedValue(false);
  vi.spyOn(BookingSvc, "getBookingById").mockResolvedValue(
    structuredClone(BOOKING) as never,
  );
});

const view = (userId?: string, systemRole?: string) =>
  BookingSvc.getBookingForViewer("b1", userId ? { userId, systemRole } : undefined);

describe("BookingSvc.getBookingForViewer", () => {
  it("refuses a signed-out caller", async () => {
    await expect(view()).rejects.toThrow("Booking not found");
  });

  it("refuses a stranger with the same message as a missing booking", async () => {
    await expect(view("stranger", "user")).rejects.toThrow("Booking not found");
  });

  it("lets in the guest who booked and an invited attendee", async () => {
    await expect(view("guest", "user")).resolves.toMatchObject({ id: "b1" });
    await expect(view("friend", "user")).resolves.toMatchObject({ id: "b1" });
  });

  it("lets in an admin", async () => {
    await expect(view("someone", "admin")).resolves.toMatchObject({ id: "b1" });
  });

  it("lets in the Event's Owner and staff through AppointmentAccess", async () => {
    access.canOnEvent.mockImplementation(
      async (_e: string, userId: string) => userId === "organizer",
    );
    await expect(view("organizer", "user")).resolves.toMatchObject({ id: "b1" });
  });

  it("lets in the booked Venue's Mayor and staff", async () => {
    access.canOnVenue.mockImplementation(
      async (venueId: string, userId: string, permission: string) =>
        venueId === "v1" &&
        userId === "mayor" &&
        permission === "venue:view-bookings",
    );
    await expect(view("mayor", "user")).resolves.toMatchObject({ id: "b1" });
  });
});
