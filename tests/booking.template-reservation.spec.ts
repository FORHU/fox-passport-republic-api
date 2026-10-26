import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Booking a package reserves everything it takes off the calendar: its gear,
 * its services, and its venue. Venues used to be left off, so two package
 * bookings (or a package and a direct venue booking) could take the same
 * venue on the same night. A clash is a 409 the guest can read, and leaves no
 * open booking behind.
 */

const repo = vi.hoisted(() => ({ cancel: vi.fn(async () => ({})) }));
vi.mock("../src/modules/booking/booking.repository", () => ({ default: repo }));

const eventRepo = vi.hoisted(() => ({
  createFromTemplate: vi.fn(async () => ({ id: "e1" })),
  deleteUnbooked: vi.fn(async () => ({})),
  createEscrowTransactions: vi.fn(async () => ({})),
}));
vi.mock("../src/modules/event/event.repository", () => ({
  default: eventRepo,
}));

const templates = vi.hoisted(() => ({
  getPublicTemplateWithItemOwners: vi.fn(),
  calculateTotalsBreakdown: vi.fn(() => ({
    itemsTotal: 0,
    hostMarkupAmount: 0,
    platformFeeAmount: 0,
    totalAmount: 0,
  })),
}));
vi.mock("../src/modules/event-template/event-template.service", () => ({
  default: templates,
}));

const availability = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock("../src/modules/availability/availability.service", () => ({
  default: availability,
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
  announceAdminQueueChanged: vi.fn(),
  announceBookingChanged: vi.fn(),
}));
vi.mock("../src/modules/payout/payout.service", () => ({ default: class {} }));
vi.mock("../src/modules/payment/payment.service", () => ({
  default: class {},
}));

import BookingSvc from "../src/modules/booking/booking.service";
import { AvailabilityConflictError } from "../src/modules/availability/availability.types";

const TEMPLATE = {
  id: "t1",
  ownerId: "foxer",
  name: "Fiesta Birthday",
  maxAttendees: null,
  templateAssets: [
    { id: "ta1", assetId: "a1", asset: { ownerId: "o1" }, quantity: 2 },
  ],
  templateServices: [
    { id: "ts1", serviceId: "s1", service: { ownerId: "o2" } },
  ],
  templateVenues: [
    { id: "tv1", venueId: "v1", venue: { mayorId: "m1" }, matched: true },
    { id: "tv2", venueId: "v2", venue: { mayorId: "m2" }, matched: true },
  ],
};

const book = () =>
  BookingSvc.bookFromTemplate({
    userId: "guest",
    templateId: "t1",
    guestCount: 50,
    startAt: new Date("2027-06-01T10:00:00Z"),
    endAt: new Date("2027-06-01T22:00:00Z"),
    excludedVenueIds: ["tv2"],
  });

const venueTaken = () =>
  new AvailabilityConflictError(
    "Venue v1 is not available for the requested date range",
    "venue",
    "v1",
  );

let createBooking: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  templates.getPublicTemplateWithItemOwners.mockResolvedValue(
    structuredClone(TEMPLATE),
  );
  availability.reserve.mockResolvedValue(undefined);
  createBooking = vi
    .spyOn(BookingSvc, "createBooking")
    .mockResolvedValue({ id: "b1" } as never);
  vi.spyOn(BookingSvc, "invalidateCaches").mockResolvedValue(undefined);
});

describe("BookingSvc.bookFromTemplate reservations", () => {
  it("reserves the included venue with the gear and services", async () => {
    await book();
    const items = availability.reserve.mock.calls[0][1];
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "asset", itemId: "a1", quantity: 2 }),
        expect.objectContaining({
          kind: "service",
          itemId: "s1",
          eventId: "e1",
        }),
        expect.objectContaining({ kind: "venue", itemId: "v1" }),
      ]),
    );
    // The guest left tv2 out of the package: it holds no date.
    expect(items).not.toContainEqual(
      expect.objectContaining({ kind: "venue", itemId: "v2" }),
    );
    expect(eventRepo.createEscrowTransactions).toHaveBeenCalled();
  });

  it("refuses a taken venue before any booking exists, and removes the Event", async () => {
    availability.reserve.mockRejectedValueOnce(venueTaken());
    await expect(book()).rejects.toMatchObject({
      status: 409,
      code: "AVAILABILITY_CONFLICT",
      message: expect.stringMatching(/venue is already booked on those dates/),
    });
    expect(createBooking).not.toHaveBeenCalled();
    expect(eventRepo.deleteUnbooked).toHaveBeenCalledWith("e1");
  });

  it("cancels the booking when it loses a race for the dates", async () => {
    availability.reserve
      .mockResolvedValueOnce(undefined) // the check before booking passes
      .mockRejectedValueOnce(venueTaken()); // someone else wins under the lock
    await expect(book()).rejects.toMatchObject({ status: 409 });
    expect(repo.cancel).toHaveBeenCalledWith("b1");
    expect(eventRepo.createEscrowTransactions).not.toHaveBeenCalled();
  });
});
