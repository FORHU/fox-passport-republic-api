import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Appointments — docs/adr/0005-organizer-role-and-appointments.md. Replaces
 * event-organizer.spec.ts, keeping what it pinned (the Owner always passes, a
 * helper passes check-in, a stranger does not, an admin may manage, no
 * duplicates) and adding the rules that are new: invitations expire, Event
 * Appointments end with their Event, venue staff check in only on the Event's
 * day, and only approved Organizers can be invited as one.
 */

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    venue: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    appointment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    eventVenueTransaction: { findFirst: vi.fn() },
  },
}));

vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn().mockResolvedValue({}) },
}));

import { prisma } from "../src/utils/prisma";
import AppointmentAccess, {
  EVENT_ORGANIZER_GRACE_MS,
  INVITATION_TTL_MS,
  isAppointmentLive,
  isInvitationOpen,
  isWithinEventDay,
} from "../src/modules/appointment/appointment.access";
import AppointmentService, {
  displayState,
} from "../src/modules/appointment/appointment.service";
import {
  CHECK_IN_HELPER_PERMISSIONS,
  EVENT_ORGANIZER_PERMISSIONS,
  VENUE_ORGANIZER_PERMISSIONS,
  permissionsForAppointment,
} from "../src/types/permissions";

const m = prisma as unknown as {
  event: { findUnique: ReturnType<typeof vi.fn> };
  venue: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  appointment: Record<string, ReturnType<typeof vi.fn>>;
  eventVenueTransaction: { findFirst: ReturnType<typeof vi.fn> };
};

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-10T12:00:00Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

// An Event running 18:00–23:00 on the 10th.
const EVENT = {
  id: "ev1",
  name: "Jazz Night",
  organizerId: "juan",
  startAt: new Date("2026-10-10T18:00:00Z"),
  endAt: new Date("2026-10-10T23:00:00Z"),
  eventStatus: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("time rules", () => {
  describe("isInvitationOpen", () => {
    it("is open before it expires", () => {
      expect(
        isInvitationOpen({ status: "invited", expiresAt: at(HOUR) }, NOW),
      ).toBe(true);
    });
    it("is closed once it expires", () => {
      expect(
        isInvitationOpen({ status: "invited", expiresAt: at(-HOUR) }, NOW),
      ).toBe(false);
    });
    it("is never open once answered", () => {
      expect(
        isInvitationOpen({ status: "active", expiresAt: at(HOUR) }, NOW),
      ).toBe(false);
    });
  });

  describe("isAppointmentLive", () => {
    const ended = {
      ...EVENT,
      endAt: at(-2 * HOUR),
    } as unknown as Parameters<typeof isAppointmentLive>[1];

    it("keeps an active Venue Appointment live indefinitely", () => {
      expect(
        isAppointmentLive({ kind: "organizer", status: "active" }, null, NOW),
      ).toBe(true);
    });
    it("never makes an invitation live", () => {
      expect(
        isAppointmentLive({ kind: "organizer", status: "invited" }, null, NOW),
      ).toBe(false);
    });
    it("keeps an Event Organizer live for 7 days after the Event", () => {
      expect(
        isAppointmentLive({ kind: "organizer", status: "active" }, ended, NOW),
      ).toBe(true);
      const later = new Date(
        ended!.endAt.getTime() + EVENT_ORGANIZER_GRACE_MS + 1,
      );
      expect(
        isAppointmentLive(
          { kind: "organizer", status: "active" },
          ended,
          later,
        ),
      ).toBe(false);
    });
    it("ends a Check-in Helper when the Event ends", () => {
      expect(
        isAppointmentLive(
          { kind: "check_in_helper", status: "active" },
          ended,
          NOW,
        ),
      ).toBe(false);
    });
    it("ends everyone at once when the Event is cancelled", () => {
      const cancelled = {
        ...EVENT,
        eventStatus: "cancelled",
      } as unknown as Parameters<typeof isAppointmentLive>[1];
      expect(
        isAppointmentLive(
          { kind: "organizer", status: "active" },
          cancelled,
          NOW,
        ),
      ).toBe(false);
    });
  });

  describe("isWithinEventDay", () => {
    const event = EVENT as unknown as Parameters<typeof isWithinEventDay>[0];
    it("opens six hours before the Event starts", () => {
      expect(isWithinEventDay(event, new Date("2026-10-10T12:30:00Z"))).toBe(
        true,
      );
      expect(isWithinEventDay(event, new Date("2026-10-10T11:30:00Z"))).toBe(
        false,
      );
    });
    it("closes six hours after it ends", () => {
      expect(isWithinEventDay(event, new Date("2026-10-11T04:30:00Z"))).toBe(
        true,
      );
      expect(isWithinEventDay(event, new Date("2026-10-11T05:30:00Z"))).toBe(
        false,
      );
    });
  });

  describe("displayState", () => {
    it("shows an unanswered invitation past its expiry as expired", () => {
      expect(
        displayState(
          { kind: "organizer", status: "invited", expiresAt: at(-1) },
          NOW,
        ),
      ).toBe("expired");
    });
    it("shows an Appointment on a long-finished Event as finished", () => {
      const event = {
        ...EVENT,
        endAt: at(-EVENT_ORGANIZER_GRACE_MS - HOUR),
      } as never;
      expect(
        displayState(
          { kind: "organizer", status: "active", expiresAt: null, event },
          NOW,
        ),
      ).toBe("finished");
    });
  });
});

describe("permission sets", () => {
  it("gives a Check-in Helper check-in and nothing else", () => {
    expect(permissionsForAppointment("check_in_helper", "event")).toEqual([
      "booking:check-in",
    ]);
    expect(permissionsForAppointment("check_in_helper", "venue")).toEqual([
      ...CHECK_IN_HELPER_PERMISSIONS,
    ]);
  });
  it("gives an Organizer the whole set for its kind of target", () => {
    expect(permissionsForAppointment("organizer", "event")).toEqual([
      ...EVENT_ORGANIZER_PERMISSIONS,
    ]);
    expect(permissionsForAppointment("organizer", "venue")).toEqual([
      ...VENUE_ORGANIZER_PERMISSIONS,
    ]);
  });
  it.each([
    "payouts",
    "price",
    "pricing",
    "refund",
    "delete",
    "transfer",
    "appoint",
  ])("keeps anything about %s out of every Organizer set", (word) => {
    for (const p of [
      ...EVENT_ORGANIZER_PERMISSIONS,
      ...VENUE_ORGANIZER_PERMISSIONS,
    ]) {
      expect(p).not.toContain(word);
    }
  });
});

describe("AppointmentAccess.canOnEvent", () => {
  beforeEach(() => {
    m.event.findUnique.mockResolvedValue(EVENT);
  });

  it("lets the Event Owner do anything without looking for an Appointment", async () => {
    expect(
      await AppointmentAccess.canOnEvent(
        "ev1",
        "juan",
        "event:view-sales",
        NOW,
      ),
    ).toBe(true);
    expect(m.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("lets an Organizer with a live Appointment do what it grants", async () => {
    m.appointment.findFirst.mockResolvedValue({
      kind: "organizer",
      status: "active",
      permissions: [...EVENT_ORGANIZER_PERMISSIONS],
    });
    expect(
      await AppointmentAccess.canOnEvent("ev1", "ben", "event:view-sales", NOW),
    ).toBe(true);
  });

  it("does not let a Check-in Helper see sales", async () => {
    m.appointment.findFirst.mockResolvedValue({
      kind: "check_in_helper",
      status: "active",
      permissions: ["booking:check-in"],
    });
    expect(
      await AppointmentAccess.canOnEvent("ev1", "lea", "event:view-sales", NOW),
    ).toBe(false);
  });

  it("stops an Organizer once the grace period after the Event is over", async () => {
    m.appointment.findFirst.mockResolvedValue({
      kind: "organizer",
      status: "active",
      permissions: [...EVENT_ORGANIZER_PERMISSIONS],
    });
    const later = new Date(
      EVENT.endAt.getTime() + EVENT_ORGANIZER_GRACE_MS + HOUR,
    );
    expect(
      await AppointmentAccess.canOnEvent(
        "ev1",
        "ben",
        "event:view-sales",
        later,
      ),
    ).toBe(false);
  });

  it("lets venue staff check in on the Event's day", async () => {
    m.appointment.findFirst.mockResolvedValue(null);
    m.eventVenueTransaction.findFirst.mockResolvedValue({ id: "tx1" });
    expect(
      await AppointmentAccess.canOnEvent(
        "ev1",
        "maria-staff",
        "booking:check-in",
        new Date("2026-10-10T19:00:00Z"),
      ),
    ).toBe(true);
  });

  it("does not let venue staff check in on another day", async () => {
    m.appointment.findFirst.mockResolvedValue(null);
    m.eventVenueTransaction.findFirst.mockResolvedValue({ id: "tx1" });
    expect(
      await AppointmentAccess.canOnEvent(
        "ev1",
        "maria-staff",
        "booking:check-in",
        new Date("2026-10-08T19:00:00Z"),
      ),
    ).toBe(false);
    expect(m.eventVenueTransaction.findFirst).not.toHaveBeenCalled();
  });

  it("gives venue staff nothing but check-in on someone else's Event", async () => {
    m.appointment.findFirst.mockResolvedValue(null);
    m.eventVenueTransaction.findFirst.mockResolvedValue({ id: "tx1" });
    expect(
      await AppointmentAccess.canOnEvent(
        "ev1",
        "maria-staff",
        "event:view-sales",
        new Date("2026-10-10T19:00:00Z"),
      ),
    ).toBe(false);
    expect(m.eventVenueTransaction.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a stranger", async () => {
    m.appointment.findFirst.mockResolvedValue(null);
    m.eventVenueTransaction.findFirst.mockResolvedValue(null);
    expect(
      await AppointmentAccess.canOnEvent(
        "ev1",
        "stranger",
        "booking:check-in",
        new Date("2026-10-10T19:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("AppointmentAccess.canOnVenue", () => {
  beforeEach(() => {
    m.venue.findUnique.mockResolvedValue({ mayorId: "maria" });
  });

  it("lets the Mayor do anything", async () => {
    expect(
      await AppointmentAccess.canOnVenue("v1", "maria", "venue:edit-listing"),
    ).toBe(true);
  });

  it("lets an Organizer do what their Appointment grants", async () => {
    m.appointment.findFirst.mockResolvedValue({
      permissions: [...VENUE_ORGANIZER_PERMISSIONS],
    });
    expect(
      await AppointmentAccess.canOnVenue("v1", "ben", "venue:calendar"),
    ).toBe(true);
  });

  it("does not let a Check-in Helper edit the listing", async () => {
    m.appointment.findFirst.mockResolvedValue({
      permissions: ["booking:check-in"],
    });
    expect(
      await AppointmentAccess.canOnVenue("v1", "lea", "venue:edit-listing"),
    ).toBe(false);
  });
});

describe("AppointmentService.appoint", () => {
  const owner = { userId: "juan", systemRole: "user" };

  beforeEach(() => {
    m.event.findUnique.mockResolvedValue(EVENT);
    m.appointment.findFirst.mockResolvedValue(null);
    m.appointment.create.mockImplementation(async ({ data }) => ({
      id: "a1",
      ...data,
    }));
  });

  it("invites an approved Organizer, pending acceptance, expiring in 14 days", async () => {
    m.user.findUnique.mockResolvedValue({
      id: "ben",
      email: "ben@example.com",
      roleType: ["organizer"],
    });
    const before = Date.now();
    await AppointmentService.appoint({ eventId: "ev1" }, owner, {
      kind: "organizer",
      email: "ben@example.com",
    });
    const { data } = m.appointment.create.mock.calls[0][0];
    expect(data.status).toBe("invited");
    expect(data.permissions).toEqual([...EVENT_ORGANIZER_PERMISSIONS]);
    const ttl = data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(INVITATION_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(INVITATION_TTL_MS + 1000);
  });

  it("refuses to invite someone without the Organizer role", async () => {
    m.user.findUnique.mockResolvedValue({
      id: "sam",
      email: "sam@example.com",
      roleType: [],
    });
    await expect(
      AppointmentService.appoint({ eventId: "ev1" }, owner, {
        kind: "organizer",
        email: "sam@example.com",
      }),
    ).rejects.toThrow(/Only approved Organizers/);
    expect(m.appointment.create).not.toHaveBeenCalled();
  });

  it("adds anyone as a Check-in Helper, effective at once, check-in only", async () => {
    m.user.findUnique.mockResolvedValue({
      id: "lea",
      email: "lea@example.com",
      roleType: [],
    });
    await AppointmentService.appoint({ eventId: "ev1" }, owner, {
      kind: "check_in_helper",
      email: "lea@example.com",
    });
    const { data } = m.appointment.create.mock.calls[0][0];
    expect(data.status).toBe("active");
    expect(data.expiresAt).toBeNull();
    expect(data.permissions).toEqual(["booking:check-in"]);
  });

  it("refuses anyone but the Event Owner", async () => {
    await expect(
      AppointmentService.appoint(
        { eventId: "ev1" },
        { userId: "attacker", systemRole: "user" },
        { kind: "check_in_helper", email: "x@example.com" },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets an admin with event:manage-organizers manage it", async () => {
    m.user.findUnique.mockResolvedValue({
      id: "lea",
      email: "lea@example.com",
      roleType: [],
    });
    await AppointmentService.appoint(
      { eventId: "ev1" },
      { userId: "admin1", systemRole: "admin" },
      { kind: "check_in_helper", email: "lea@example.com" },
    );
    expect(m.appointment.create).toHaveBeenCalled();
  });

  it("refuses to appoint the Owner to their own Event", async () => {
    m.user.findUnique.mockResolvedValue({
      id: "juan",
      email: "juan@example.com",
      roleType: ["organizer"],
    });
    await expect(
      AppointmentService.appoint({ eventId: "ev1" }, owner, {
        kind: "organizer",
        email: "juan@example.com",
      }),
    ).rejects.toThrow(/already run this event/);
  });

  it("refuses a second live Appointment for the same person", async () => {
    m.user.findUnique.mockResolvedValue({
      id: "lea",
      email: "lea@example.com",
      roleType: [],
    });
    m.appointment.findFirst.mockResolvedValue({ status: "active" });
    await expect(
      AppointmentService.appoint({ eventId: "ev1" }, owner, {
        kind: "check_in_helper",
        email: "lea@example.com",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("AppointmentService.accept", () => {
  const invitation = (overrides = {}) => ({
    id: "a1",
    userId: "ben",
    appointedById: "juan",
    kind: "organizer",
    status: "invited",
    expiresAt: new Date(Date.now() + HOUR),
    event: EVENT,
    venue: null,
    ...overrides,
  });

  it("activates an open invitation for someone who still holds the role", async () => {
    m.appointment.findUnique.mockResolvedValue(invitation());
    m.user.findUnique.mockResolvedValue({
      id: "ben",
      email: "ben@example.com",
      roleType: ["organizer"],
    });
    m.appointment.update.mockResolvedValue(invitation({ status: "active" }));
    await AppointmentService.accept("a1", "ben");
    expect(m.appointment.update.mock.calls[0][0].data.status).toBe("active");
  });

  it("refuses an expired invitation", async () => {
    m.appointment.findUnique.mockResolvedValue(
      invitation({ expiresAt: new Date(Date.now() - HOUR) }),
    );
    await expect(AppointmentService.accept("a1", "ben")).rejects.toMatchObject({
      status: 410,
    });
  });

  it("refuses someone whose Organizer role was taken away meanwhile", async () => {
    m.appointment.findUnique.mockResolvedValue(invitation());
    m.user.findUnique.mockResolvedValue({
      id: "ben",
      email: "ben@example.com",
      roleType: [],
    });
    await expect(AppointmentService.accept("a1", "ben")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("will not let anyone else answer the invitation", async () => {
    m.appointment.findUnique.mockResolvedValue(invitation());
    await expect(
      AppointmentService.accept("a1", "someone-else"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("AppointmentService.remove", () => {
  it("will not remove an Appointment through a different Event", async () => {
    m.event.findUnique.mockResolvedValue({ ...EVENT, id: "ev2" });
    m.appointment.findUnique.mockResolvedValue({
      id: "a1",
      eventId: "ev1",
      venueId: null,
      status: "active",
    });
    await expect(
      AppointmentService.remove({ eventId: "ev2" }, "a1", {
        userId: "juan",
        systemRole: "user",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(m.appointment.update).not.toHaveBeenCalled();
  });
});

describe("role loss", () => {
  it("touches nothing when no owning role was lost", async () => {
    await AppointmentService.endForRevokedOwner(
      "juan",
      { venueFoxer: false, eventFoxer: false },
      "admin1",
    );
    expect(m.appointment.findMany).not.toHaveBeenCalled();
  });

  it("ends only Organizer Appointments when the Organizer role goes", async () => {
    m.appointment.findMany.mockResolvedValue([{ id: "a1" }]);
    await AppointmentService.endForRevokedOrganizer("ben", "admin1");
    const { where } = m.appointment.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ userId: "ben", kind: "organizer" });
    expect(m.appointment.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "ended",
      endReason: "role_revoked",
    });
  });
});

describe("AppointmentAccess.describe", () => {
  it("names the Event Owner, with every Organizer permission", async () => {
    m.event.findUnique.mockResolvedValue(EVENT);
    expect(
      await AppointmentAccess.describe({ eventId: "ev1" }, "juan", NOW),
    ).toEqual({ role: "owner", permissions: [...EVENT_ORGANIZER_PERMISSIONS] });
  });

  it("names a live Organizer, with what their Appointment grants", async () => {
    m.event.findUnique.mockResolvedValue(EVENT);
    m.appointment.findFirst.mockResolvedValue({
      kind: "organizer",
      status: "active",
      permissions: ["booking:check-in", "event:view-sales"],
    });
    expect(
      await AppointmentAccess.describe({ eventId: "ev1" }, "ben", NOW),
    ).toEqual({
      role: "organizer",
      permissions: ["booking:check-in", "event:view-sales"],
    });
  });

  it("names nobody once an Event Organizer's time is over", async () => {
    m.event.findUnique.mockResolvedValue(EVENT);
    m.appointment.findFirst.mockResolvedValue({
      kind: "organizer",
      status: "active",
      permissions: [...EVENT_ORGANIZER_PERMISSIONS],
    });
    const later = new Date(
      EVENT.endAt.getTime() + EVENT_ORGANIZER_GRACE_MS + HOUR,
    );
    expect(
      await AppointmentAccess.describe({ eventId: "ev1" }, "ben", later),
    ).toEqual({ role: null, permissions: [] });
  });

  it("names the Mayor of a Venue", async () => {
    m.venue.findUnique.mockResolvedValue({ mayorId: "maria" });
    expect(
      await AppointmentAccess.describe({ venueId: "v1" }, "maria"),
    ).toEqual({ role: "owner", permissions: [...VENUE_ORGANIZER_PERMISSIONS] });
  });

  it("names a stranger as nobody", async () => {
    m.venue.findUnique.mockResolvedValue({ mayorId: "maria" });
    m.appointment.findFirst.mockResolvedValue(null);
    expect(
      await AppointmentAccess.describe({ venueId: "v1" }, "stranger"),
    ).toEqual({ role: null, permissions: [] });
  });
});

describe("Organizer requests", () => {
  const open = { ...EVENT, acceptsOrganizerRequests: true };
  const organizer = {
    id: "ben",
    name: "Ben",
    email: "ben@example.com",
    roleType: ["organizer"],
  };

  beforeEach(() => {
    m.event.findUnique.mockResolvedValue(open);
    m.user.findUnique.mockResolvedValue(organizer);
    m.appointment.findFirst.mockResolvedValue(null);
    m.appointment.count.mockResolvedValue(0);
    m.appointment.create.mockImplementation(async ({ data }) => ({
      id: "r1",
      ...data,
    }));
  });

  it("lets an approved Organizer ask to join an Event that accepts requests", async () => {
    await AppointmentService.requestToJoin({ eventId: "ev1" }, "ben");
    const { data } = m.appointment.create.mock.calls[0][0];
    expect(data).toMatchObject({
      status: "requested",
      kind: "organizer",
      userId: "ben",
      // The owner who will answer it.
      appointedById: "juan",
    });
    expect(data.expiresAt).toBeInstanceOf(Date);
  });

  it("refuses when the owner hasn't switched requests on", async () => {
    m.event.findUnique.mockResolvedValue({
      ...EVENT,
      acceptsOrganizerRequests: false,
    });
    await expect(
      AppointmentService.requestToJoin({ eventId: "ev1" }, "ben"),
    ).rejects.toThrow(/isn't taking requests/);
    expect(m.appointment.create).not.toHaveBeenCalled();
  });

  it("refuses someone without the Organizer role", async () => {
    m.user.findUnique.mockResolvedValue({ ...organizer, roleType: [] });
    await expect(
      AppointmentService.requestToJoin({ eventId: "ev1" }, "ben"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses the owner asking to join their own Event", async () => {
    await expect(
      AppointmentService.requestToJoin({ eventId: "ev1" }, "juan"),
    ).rejects.toThrow(/already run this/);
  });

  it("caps an Organizer at five open requests", async () => {
    m.appointment.count.mockResolvedValue(5);
    await expect(
      AppointmentService.requestToJoin({ eventId: "ev1" }, "ben"),
    ).rejects.toMatchObject({ status: 429 });
    expect(m.appointment.create).not.toHaveBeenCalled();
  });

  it("clears an expired invitation so a fresh request can take its place", async () => {
    m.appointment.findFirst.mockResolvedValue({
      id: "old",
      status: "invited",
      expiresAt: new Date(Date.now() - HOUR),
    });
    await AppointmentService.requestToJoin({ eventId: "ev1" }, "ben");
    expect(m.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "old" } }),
    );
    expect(m.appointment.create).toHaveBeenCalled();
  });

  it("lets the owner accept a request, which makes it active at once", async () => {
    m.appointment.findUnique.mockResolvedValue({
      id: "r1",
      userId: "ben",
      status: "requested",
      eventId: "ev1",
      venueId: null,
      expiresAt: new Date(Date.now() + HOUR),
    });
    m.appointment.update.mockResolvedValue({});
    await AppointmentService.respondToRequest(
      { eventId: "ev1" },
      "r1",
      { userId: "juan", systemRole: "user" },
      true,
    );
    expect(m.appointment.update.mock.calls[0][0].data.status).toBe("active");
  });

  it("will not let anyone but the owner answer a request", async () => {
    await expect(
      AppointmentService.respondToRequest(
        { eventId: "ev1" },
        "r1",
        { userId: "ben", systemRole: "user" },
        true,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets only the Organizer who asked withdraw a request", async () => {
    m.appointment.findUnique.mockResolvedValue({
      id: "r1",
      userId: "ben",
      status: "requested",
    });
    await expect(
      AppointmentService.withdrawRequest("r1", "someone-else"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("only lets Mayors and Event Owners search for Organizers", async () => {
    await expect(
      AppointmentService.searchOrganizers(
        { userId: "rosa", systemRole: "user", roleType: [] },
        {},
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns profile cards without email addresses", async () => {
    m.user.findMany.mockResolvedValue([
      {
        id: "ben",
        name: "Ben",
        imgId: null,
        city: "Davao",
        foxerSpecializations: [{ category: "wedding" }],
        passport: { paths: [{ level: 3, totalXP: 2500 }] },
      },
    ]);
    const [card] = await AppointmentService.searchOrganizers(
      { userId: "juan", systemRole: "user", roleType: ["eventFoxer"] },
      { q: "ben" },
    );
    expect(card).toEqual({
      id: "ben",
      name: "Ben",
      imgId: null,
      city: "Davao",
      specializations: ["wedding"],
      level: 3,
      totalXP: 2500,
    });
    expect(card).not.toHaveProperty("email");
  });
});
