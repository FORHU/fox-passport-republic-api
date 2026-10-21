import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The calendar a Venue Foxer reads. Two things used to be missing from it:
 *
 *  - a booking on the venue that was still waiting for the venue's reply, or
 *    held pending payment: only `approved` ones were returned, so a request
 *    did not show until it was already confirmed;
 *  - the days the venue's owner closed themselves.
 *
 * Prisma is mocked, as in the other unit specs: no database is touched.
 */

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    booking: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
    assetBooking: { findMany: vi.fn() },
    serviceBooking: { findMany: vi.fn() },
    eventServiceTransaction: { findMany: vi.fn() },
    eventAssetTransaction: { findMany: vi.fn() },
    venue: { findMany: vi.fn() },
  },
}));

import { prisma } from "../src/utils/prisma";
import CalendarSvc from "../src/modules/calendar/calendar.service";

const db = prisma as unknown as Record<
  string,
  { findMany: ReturnType<typeof vi.fn> }
>;

const FROM = new Date("2026-12-01T00:00:00.000Z");
const TO = new Date("2027-01-01T00:00:00.000Z");

/** Everything empty except what a test fills in. */
function resetDb() {
  for (const model of Object.values(db)) {
    model.findMany.mockReset().mockResolvedValue([]);
  }
}

/** The events the venue-side query returns; the run-by-me query gets none. */
function venueEventsReturn(rows: unknown[]) {
  db.event.findMany.mockImplementation(async (args: { where: object }) =>
    JSON.stringify(args.where).includes("venueTransactions") ? rows : [],
  );
}

function bookingAtVenue(
  id: string,
  status: string,
  venue = { id: "v1", name: "Sky Hall" },
) {
  return {
    id,
    name: `Party ${id}`,
    startAt: new Date("2026-12-10T10:00:00.000Z"),
    endAt: new Date("2026-12-10T22:00:00.000Z"),
    eventStatus: "approved",
    venueTransactions: [{ status, venue }],
  };
}

beforeEach(resetDb);

describe("calendar: bookings at the viewer's venue", () => {
  it("asks for every status that holds the dates, not only approved", async () => {
    await CalendarSvc.forViewer("mayor", FROM, TO);

    const venueQuery = db.event.findMany.mock.calls
      .map((c) => c[0].where)
      .find((w) => JSON.stringify(w).includes("venueTransactions"));
    const statuses = venueQuery.venueTransactions.some.status.in;
    expect(statuses).toEqual([
      "pending_provider_confirmation",
      "pending",
      "approved",
    ]);
  });

  it("returns a request still waiting for the venue's reply", async () => {
    venueEventsReturn([bookingAtVenue("e1", "pending_provider_confirmation")]);

    const [entry] = await CalendarSvc.forViewer("mayor", FROM, TO);

    expect(entry).toMatchObject({
      role: "venue",
      kind: "event",
      venueId: "v1",
      venueName: "Sky Hall",
      venueStatus: "pending_provider_confirmation",
    });
    expect(entry.title).toBe("Party e1 · Sky Hall");
  });

  it("tells held, waiting and confirmed bookings apart", async () => {
    venueEventsReturn([
      bookingAtVenue("held", "pending"),
      bookingAtVenue("waiting", "pending_provider_confirmation"),
      bookingAtVenue("confirmed", "approved"),
    ]);

    const entries = await CalendarSvc.forViewer("mayor", FROM, TO);

    expect(
      Object.fromEntries(entries.map((e) => [e.id, e.venueStatus])),
    ).toEqual({
      "venue-event:held": "pending",
      "venue-event:waiting": "pending_provider_confirmation",
      "venue-event:confirmed": "approved",
    });
  });

  it("leaves status as the event's, so existing readers see no change", async () => {
    venueEventsReturn([bookingAtVenue("e1", "pending")]);

    const [entry] = await CalendarSvc.forViewer("mayor", FROM, TO);

    expect(entry.status).toBe("approved");
  });

  it("is still scoped to venues the viewer may see bookings for", async () => {
    await CalendarSvc.forViewer("mayor", FROM, TO);

    const where = db.event.findMany.mock.calls
      .map((c) => JSON.stringify(c[0].where))
      .find((w) => w.includes("venueTransactions"))!;
    expect(where).toContain('"mayorId":"mayor"');
    expect(where).toContain("venue:view-bookings");
  });
});

describe("calendar: blocked days", () => {
  const venue = {
    id: "v1",
    name: "Sky Hall",
    blockedDates: [
      new Date("2026-12-24T00:00:00.000Z"),
      new Date("2026-12-25T00:00:00.000Z"),
      new Date("2027-02-01T00:00:00.000Z"), // after the range
      new Date("2026-11-30T00:00:00.000Z"), // before the range
    ],
  };

  it("are left out unless asked for", async () => {
    db.venue.findMany.mockResolvedValue([venue]);

    const entries = await CalendarSvc.forViewer("mayor", FROM, TO);

    expect(entries.filter((e) => e.kind === "block")).toEqual([]);
    expect(db.venue.findMany).not.toHaveBeenCalled();
  });

  it("come back as one entry per venue per day, within the range", async () => {
    db.venue.findMany.mockResolvedValue([venue]);

    const entries = await CalendarSvc.forViewer("mayor", FROM, TO, {
      includeBlocks: true,
    });
    const blocks = entries.filter((e) => e.kind === "block");

    expect(blocks.map((b) => b.id)).toEqual([
      "venue-block:v1:2026-12-24",
      "venue-block:v1:2026-12-25",
    ]);
    expect(blocks[0]).toMatchObject({
      role: "venue",
      status: "blocked",
      venueId: "v1",
      venueName: "Sky Hall",
      title: "Blocked · Sky Hall",
    });
    // A whole calendar day, midnight to midnight.
    expect(blocks[0].start.toISOString()).toBe("2026-12-24T00:00:00.000Z");
    expect(blocks[0].end.toISOString()).toBe("2026-12-25T00:00:00.000Z");
  });

  it("a day stored at some other time of day is still that calendar day", async () => {
    db.venue.findMany.mockResolvedValue([
      {
        id: "v1",
        name: "Sky Hall",
        blockedDates: [new Date("2026-12-24T17:30:00.000Z")],
      },
    ]);

    const [block] = await CalendarSvc.forViewer("mayor", FROM, TO, {
      includeBlocks: true,
    });

    expect(block.start.toISOString()).toBe("2026-12-24T00:00:00.000Z");
  });

  it("are only for venues whose calendar the viewer manages", async () => {
    await CalendarSvc.forViewer("mayor", FROM, TO, { includeBlocks: true });

    const where = JSON.stringify(db.venue.findMany.mock.calls[0][0].where);
    expect(where).toContain('"mayorId":"mayor"');
    expect(where).toContain("venue:calendar");
  });

  it("are sorted in with everything else by start", async () => {
    venueEventsReturn([bookingAtVenue("e1", "approved")]); // 10 Dec
    db.venue.findMany.mockResolvedValue([
      { id: "v1", name: "Sky Hall", blockedDates: [new Date("2026-12-05")] },
    ]);

    const entries = await CalendarSvc.forViewer("mayor", FROM, TO, {
      includeBlocks: true,
    });

    expect(entries.map((e) => e.kind)).toEqual(["block", "event"]);
  });
});

describe("calendar: range", () => {
  it("still refuses a backwards or over-long range", async () => {
    await expect(CalendarSvc.forViewer("mayor", TO, FROM)).rejects.toThrow();
    await expect(
      CalendarSvc.forViewer(
        "mayor",
        new Date("2024-01-01"),
        new Date("2026-01-01"),
      ),
    ).rejects.toThrow(/limited/);
  });
});
