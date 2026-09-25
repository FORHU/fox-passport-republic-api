import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Where an appointed Organizer's permissions reach real endpoints — ADR 0005.
 *
 * `AppointmentAccess` itself is covered in appointment.spec.ts; it is mocked
 * here so each test is about one endpoint asking it the right question, and
 * about the lines that stay the Mayor's or Event Owner's whatever an
 * Organizer holds: prices (a venue's price fields, an affiliation's
 * `agreedPrice`, a bid's proposed price) and refunds (declining a client's
 * request refunds them).
 */

const access = vi.hoisted(() => ({
  canOnEvent: vi.fn(),
  canOnVenue: vi.fn(),
}));
vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: {
    canOnEvent: access.canOnEvent,
    canOnVenue: access.canOnVenue,
    eventScope: vi.fn(() => ({})),
    venueScope: vi.fn(() => ({})),
  },
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    review: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    venue: { findUnique: vi.fn() },
  },
}));

vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../src/modules/venue/venue.repository", () => ({
  default: {
    findVenueById: vi.fn(),
    updateVenue: vi.fn().mockResolvedValue({ id: "v1" }),
  },
}));

vi.mock(
  "../src/modules/venue-affiliation/venue-affiliation.repository",
  () => ({
    default: {
      findById: vi.fn(),
      setStatus: vi.fn().mockResolvedValue({ id: "aff1" }),
      findForVenue: vi.fn().mockResolvedValue([]),
    },
  }),
);

vi.mock("../src/modules/bidding/bidding.repository", () => ({
  default: {
    findServiceBidById: vi.fn(),
    updateServiceBidStatus: vi.fn().mockResolvedValue({ id: "b1" }),
    findServiceBidsByEventId: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/modules/review/review.repository", () => ({
  default: { createReply: vi.fn().mockResolvedValue({ id: "r2" }) },
}));

vi.mock("../src/modules/event-request/event-request.repository", () => ({
  default: {
    updateRequestStatus: vi.fn().mockResolvedValue({}),
    rejectRequest: vi.fn().mockResolvedValue({}),
  },
}));

import { prisma } from "../src/utils/prisma";
import NotificationService from "../src/modules/notifications/user-notification.service";
import VenueSvc from "../src/modules/venue/venue.service";
import VenueRepo from "../src/modules/venue/venue.repository";
import VenueAffiliationSvc from "../src/modules/venue-affiliation/venue-affiliation.service";
import VenueAffiliationRepo from "../src/modules/venue-affiliation/venue-affiliation.repository";
import BiddingSvc from "../src/modules/bidding/bidding.service";
import BiddingRepo from "../src/modules/bidding/bidding.repository";
import ReviewSvc from "../src/modules/review/review.service";
import ReviewRepo from "../src/modules/review/review.repository";
import MatchSvc from "../src/modules/match/match.service";
import EventRequestRepo from "../src/modules/event-request/event-request.repository";

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  access.canOnEvent.mockResolvedValue(false);
  access.canOnVenue.mockResolvedValue(false);
});

describe("venue listing — venue:edit-listing", () => {
  beforeEach(() => {
    fn(VenueRepo.findVenueById).mockResolvedValue({
      id: "v1",
      mayorId: "maria",
      status: "available",
      // A published Venue always has its service area.
      boundary: [
        [121.0, 14.5],
        [121.01, 14.5],
        [121.01, 14.51],
        [121.0, 14.51],
        [121.0, 14.5],
      ],
    });
  });

  it("lets an Organizer change how the Venue is described", async () => {
    access.canOnVenue.mockResolvedValue(true);
    await VenueSvc.updateVenue({
      id: "v1",
      requesterId: "ben",
      data: { description: "Now with a garden terrace" },
    });
    expect(access.canOnVenue).toHaveBeenCalledWith(
      "v1",
      "ben",
      "venue:edit-listing",
    );
    expect(VenueRepo.updateVenue).toHaveBeenCalled();
  });

  it.each([
    ["price", { price: 5000 }],
    ["extraGuestRate", { extraGuestRate: 100 }],
    ["capacity", { capacity: 900 }],
    ["name", { name: "Renamed" }],
    ["status", { status: "draft" }],
  ])("refuses an Organizer changing %s", async (field, data) => {
    access.canOnVenue.mockResolvedValue(true);
    await expect(
      VenueSvc.updateVenue({
        id: "v1",
        requesterId: "ben",
        data: data as never,
      }),
    ).rejects.toThrow(new RegExp(`only the Mayor can change ${field}`));
    expect(VenueRepo.updateVenue).not.toHaveBeenCalled();
  });

  it("refuses someone with no Appointment at all", async () => {
    await expect(
      VenueSvc.updateVenue({
        id: "v1",
        requesterId: "stranger",
        data: { description: "x" },
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("still lets the Mayor change the price", async () => {
    await VenueSvc.updateVenue({
      id: "v1",
      requesterId: "maria",
      data: { price: 5000 },
    });
    expect(access.canOnVenue).not.toHaveBeenCalled();
    expect(VenueRepo.updateVenue).toHaveBeenCalled();
  });
});

describe("venue affiliations — venue:approve-affiliations", () => {
  const application = (agreedPrice: number | null) => ({
    id: "aff1",
    venueId: "v1",
    eventFoxerId: "juan",
    initiatedBy: "eventFoxer",
    status: "pending",
    agreedPrice,
    venue: { mayorId: "maria", name: "Sky Hall" },
    eventFoxer: { name: "Juan" },
  });

  it("lets an Organizer approve an application at the standard price", async () => {
    fn(VenueAffiliationRepo.findById).mockResolvedValue(application(null));
    access.canOnVenue.mockResolvedValue(true);
    await VenueAffiliationSvc.approve("aff1", "ben");
    expect(VenueAffiliationRepo.setStatus).toHaveBeenCalledWith(
      "aff1",
      "approved",
      "ben",
    );
  });

  it("tells the Event Foxer — not the Mayor — when an Organizer decides", async () => {
    fn(VenueAffiliationRepo.findById).mockResolvedValue(application(null));
    access.canOnVenue.mockResolvedValue(true);
    await VenueAffiliationSvc.approve("aff1", "ben");
    expect(NotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "juan" }),
    );
  });

  it("keeps approving one that sets a price for the Mayor alone", async () => {
    fn(VenueAffiliationRepo.findById).mockResolvedValue(application(5000));
    access.canOnVenue.mockResolvedValue(true);
    await expect(VenueAffiliationSvc.approve("aff1", "ben")).rejects.toThrow(
      /only the venue's mayor can approve/,
    );
    expect(VenueAffiliationRepo.setStatus).not.toHaveBeenCalled();
  });

  it("still lets an Organizer reject one that sets a price", async () => {
    fn(VenueAffiliationRepo.findById).mockResolvedValue(application(5000));
    access.canOnVenue.mockResolvedValue(true);
    await VenueAffiliationSvc.reject("aff1", "ben", "Dates clash");
    expect(VenueAffiliationRepo.setStatus).toHaveBeenCalled();
  });

  it("lets the Mayor approve one that sets a price", async () => {
    fn(VenueAffiliationRepo.findById).mockResolvedValue(application(5000));
    await VenueAffiliationSvc.approve("aff1", "maria");
    expect(VenueAffiliationRepo.setStatus).toHaveBeenCalled();
  });

  it("refuses someone with no Appointment", async () => {
    fn(VenueAffiliationRepo.findById).mockResolvedValue(application(null));
    await expect(
      VenueAffiliationSvc.approve("aff1", "stranger"),
    ).rejects.toThrow(/mayor or organizers/);
  });
});

describe("bids — event:manage-bids", () => {
  const bid = {
    id: "b1",
    providerId: "dj",
    status: "pending",
    event: { id: "ev1", organizerId: "juan" },
  };

  it("lets an Organizer reject a bid", async () => {
    fn(BiddingRepo.findServiceBidById).mockResolvedValue(bid);
    access.canOnEvent.mockResolvedValue(true);
    await BiddingSvc.rejectServiceBid("b1", "ben");
    expect(access.canOnEvent).toHaveBeenCalledWith(
      "ev1",
      "ben",
      "event:manage-bids",
    );
    expect(BiddingRepo.updateServiceBidStatus).toHaveBeenCalledWith(
      "b1",
      "rejected",
    );
  });

  it("closes the gap where anyone could read any Event's bids", async () => {
    await expect(
      BiddingSvc.getServiceBidsForEvent("ev1", "stranger"),
    ).rejects.toThrow(/owner or organizers/);
    expect(BiddingRepo.findServiceBidsByEventId).not.toHaveBeenCalled();
  });
});

describe("review replies — venue:reply", () => {
  it("lets a Venue Organizer answer a review of the Venue", async () => {
    fn(prisma.review.findUnique).mockResolvedValue({
      id: "r1",
      userId: "guest",
      entityType: "venue",
      entityId: "v1",
    });
    access.canOnVenue.mockResolvedValue(true);
    await ReviewSvc.replyToReview("r1", "ben", "Thank you!");
    expect(access.canOnVenue).toHaveBeenCalledWith("v1", "ben", "venue:reply");
    expect(ReviewRepo.createReply).toHaveBeenCalledWith(
      "r1",
      "ben",
      "Thank you!",
    );
  });
});

describe("client requests — event:approve-bookings", () => {
  const request = {
    id: "ev1",
    organizerId: "juan",
    requestStatus: "pending",
    clientId: "client",
    name: "Jazz Night",
    bookings: [],
  };

  it("lets an Organizer accept a client's request", async () => {
    fn(prisma.event.findUnique).mockResolvedValue(request);
    access.canOnEvent.mockResolvedValue(true);
    await MatchSvc.acceptMatch("ev1", "ben");
    expect(access.canOnEvent).toHaveBeenCalledWith(
      "ev1",
      "ben",
      "event:approve-bookings",
    );
    expect(EventRequestRepo.updateRequestStatus).toHaveBeenCalledWith(
      "ev1",
      "approved",
    );
  });

  it("keeps declining — which refunds the client — for the Event Owner", async () => {
    fn(prisma.event.findUnique).mockResolvedValue(request);
    access.canOnEvent.mockResolvedValue(true);
    await expect(MatchSvc.declineMatch("ev1", "ben")).rejects.toThrow(
      "Unauthorized",
    );
    expect(EventRequestRepo.rejectRequest).not.toHaveBeenCalled();
  });
});
