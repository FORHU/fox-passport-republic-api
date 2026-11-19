import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  events: vi.fn(),
  eventOne: vi.fn(),
  unpaid: vi.fn(),
  venueTx: vi.fn(),
  assetTx: vi.fn(),
  serviceTx: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    event: { findMany: db.events, findFirst: db.eventOne },
    booking: { findFirst: db.unpaid },
    eventVenueTransaction: { findMany: db.venueTx },
    eventAssetTransaction: { findMany: db.assetTx },
    eventServiceTransaction: { findMany: db.serviceTx },
  },
}));

vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: db.notify },
}));

import EventConflictSvc, {
  blockedDayHitsEvent,
  dayKey,
} from "../src/modules/event-transaction/event-conflict.service";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const at = (iso: string) => new Date(iso);

const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  name: "Garden wedding",
  startAt: at("2026-12-05T10:00:00.000Z"),
  endAt: at("2026-12-05T15:00:00.000Z"),
  assetTransactions: [],
  serviceTransactions: [],
  venueTransactions: [],
  ...over,
});

const assetTx = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  status: "approved",
  rejectionReason: null,
  provider: { name: "Maria Provider" },
  asset: { name: "Sound system", status: "available", deletedAt: null },
  ...over,
});
const serviceTx = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  status: "approved",
  rejectionReason: null,
  provider: { name: "Pedro Photo" },
  service: { name: "Photographer", status: "available", deletedAt: null },
  ...over,
});
const venueTx = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  status: "approved",
  rejectionReason: null,
  provider: { name: "Mayor Cruz" },
  venue: { name: "Sky Hall", blockedDates: [] as Date[] },
  ...over,
});

beforeEach(() => {
  Object.values(db).forEach((f) => f.mockReset());
  db.notify.mockResolvedValue({});
  db.unpaid.mockResolvedValue(null);
});

describe("blockedDayHitsEvent", () => {
  const e = {
    startAt: at("2026-12-05T10:00:00.000Z"),
    endAt: at("2026-12-05T15:00:00.000Z"),
  };

  it("counts a day blocked at midnight even though the event starts later that day", () => {
    expect(blockedDayHitsEvent([at("2026-12-05T00:00:00.000Z")], e)).toBe(true);
  });

  it("does not count the day before or after a one-day event", () => {
    expect(blockedDayHitsEvent([at("2026-12-04T00:00:00.000Z")], e)).toBe(
      false,
    );
    expect(blockedDayHitsEvent([at("2026-12-06T00:00:00.000Z")], e)).toBe(
      false,
    );
  });

  it("counts any day inside a multi-day event, and its last day", () => {
    const multi = {
      startAt: at("2026-12-05T18:00:00.000Z"),
      endAt: at("2026-12-07T02:00:00.000Z"),
    };
    expect(blockedDayHitsEvent([at("2026-12-06T00:00:00.000Z")], multi)).toBe(
      true,
    );
    expect(blockedDayHitsEvent([at("2026-12-07T00:00:00.000Z")], multi)).toBe(
      true,
    );
    expect(blockedDayHitsEvent([at("2026-12-08T00:00:00.000Z")], multi)).toBe(
      false,
    );
  });

  it("is false with nothing blocked", () => {
    expect(blockedDayHitsEvent([], e)).toBe(false);
  });

  it("keys a day by its UTC date", () => {
    expect(dayKey(at("2026-12-05T23:59:59.000Z"))).toBe("2026-12-05");
  });
});

describe("EventConflictSvc.needsAttention", () => {
  it("asks only for the person's own upcoming, live events", async () => {
    db.events.mockResolvedValue([]);

    await EventConflictSvc.needsAttention("host1", NOW);

    const where = db.events.mock.calls[0][0].where;
    expect(where.organizerId).toBe("host1");
    expect(where.endAt).toEqual({ gt: NOW });
    expect(where.eventStatus).toEqual({ notIn: ["cancelled", "completed"] });
  });

  it("lists nothing for an event with no problem", async () => {
    db.events.mockResolvedValue([
      event({
        assetTransactions: [assetTx()],
        serviceTransactions: [serviceTx()],
        venueTransactions: [venueTx()],
      }),
    ]);

    expect(await EventConflictSvc.needsAttention("host1", NOW)).toEqual([]);
  });

  it("flags a Supplier who declined, with who and what", async () => {
    db.events.mockResolvedValue([
      event({
        assetTransactions: [
          assetTx({ status: "rejected", rejectionReason: "supplier_declined" }),
        ],
      }),
    ]);

    const out = await EventConflictSvc.needsAttention("host1", NOW);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      eventId: "e1",
      eventName: "Garden wedding",
    });
    expect(out[0].issues).toEqual([
      {
        kind: "asset",
        transactionId: "a1",
        supplierName: "Maria Provider",
        itemName: "Sound system",
        reason: "declined",
        cause: null,
        pendingProposalId: null,
      },
    ]);
  });

  it("says when the Supplier declined because it is busy with another booking", async () => {
    db.events.mockResolvedValue([
      event({
        assetTransactions: [
          assetTx({
            status: "rejected",
            rejectionReason: "supplier_declined_busy",
          }),
        ],
      }),
    ]);

    const out = await EventConflictSvc.needsAttention("host1", NOW);

    expect(out[0].issues[0]).toMatchObject({
      reason: "declined",
      cause: "busy",
    });
  });

  it("does not flag a request a Provider simply turned down", async () => {
    db.events.mockResolvedValue([
      event({
        serviceTransactions: [
          serviceTx({
            status: "rejected",
            rejectionReason: "provider_declined",
          }),
        ],
      }),
    ]);

    expect(await EventConflictSvc.needsAttention("host1", NOW)).toEqual([]);
  });

  it("flags a venue blocked on a day of the event", async () => {
    db.events.mockResolvedValue([
      event({
        venueTransactions: [
          venueTx({
            venue: {
              name: "Sky Hall",
              blockedDates: [at("2026-12-05T00:00:00.000Z")],
            },
          }),
        ],
      }),
    ]);

    const out = await EventConflictSvc.needsAttention("host1", NOW);

    expect(out[0].issues[0]).toMatchObject({
      kind: "venue",
      reason: "date_blocked",
      supplierName: "Mayor Cruz",
      itemName: "Sky Hall",
    });
  });

  it("ignores a blocked day that is not a day of the event", async () => {
    db.events.mockResolvedValue([
      event({
        venueTransactions: [
          venueTx({
            venue: {
              name: "Sky Hall",
              blockedDates: [at("2026-12-20T00:00:00.000Z")],
            },
          }),
        ],
      }),
    ]);

    expect(await EventConflictSvc.needsAttention("host1", NOW)).toEqual([]);
  });

  it.each([
    [
      "an archived asset",
      "asset",
      { asset: { name: "Sound system", status: "archived", deletedAt: null } },
    ],
    [
      "a deleted asset",
      "asset",
      {
        asset: {
          name: "Sound system",
          status: "available",
          deletedAt: at("2026-11-01T00:00:00.000Z"),
        },
      },
    ],
    [
      "a paused service",
      "service",
      { service: { name: "Photographer", status: "paused", deletedAt: null } },
    ],
    [
      "a deleted service",
      "service",
      {
        service: {
          name: "Photographer",
          status: "available",
          deletedAt: at("2026-11-01T00:00:00.000Z"),
        },
      },
    ],
  ])("flags %s", async (_name, kind, over) => {
    db.events.mockResolvedValue([
      event(
        kind === "asset"
          ? { assetTransactions: [assetTx(over)] }
          : { serviceTransactions: [serviceTx(over)] },
      ),
    ]);

    const out = await EventConflictSvc.needsAttention("host1", NOW);

    expect(out[0].issues[0]).toMatchObject({ kind, reason: "unavailable" });
  });

  it("does not flag a gone listing on an item that is no longer booked", async () => {
    db.events.mockResolvedValue([
      event({
        assetTransactions: [
          assetTx({
            status: "cancelled",
            asset: {
              name: "Sound system",
              status: "archived",
              deletedAt: null,
            },
          }),
        ],
      }),
    ]);

    expect(await EventConflictSvc.needsAttention("host1", NOW)).toEqual([]);
  });

  it("gathers several problems on one event and keeps the order it was given", async () => {
    db.events.mockResolvedValue([
      event({
        id: "e1",
        assetTransactions: [
          assetTx({ status: "rejected", rejectionReason: "supplier_declined" }),
        ],
        serviceTransactions: [
          serviceTx({
            service: {
              name: "Photographer",
              status: "paused",
              deletedAt: null,
            },
          }),
        ],
      }),
      event({ id: "e2", name: "Fine event" }),
      event({
        id: "e3",
        name: "Later event",
        venueTransactions: [
          venueTx({
            status: "rejected",
            rejectionReason: "supplier_declined",
          }),
        ],
      }),
    ]);

    const out = await EventConflictSvc.needsAttention("host1", NOW);

    expect(out.map((o) => o.eventId)).toEqual(["e1", "e3"]);
    expect(out[0].issues.map((i) => i.reason)).toEqual([
      "declined",
      "unavailable",
    ]);
  });
});

describe("EventConflictSvc.notifyDayBlocked", () => {
  const row = (id: string, organizerId: string, day: string) => ({
    venue: { name: "Sky Hall" },
    event: {
      id,
      name: `Event ${id}`,
      organizerId,
      startAt: at(`${day}T10:00:00.000Z`),
      endAt: at(`${day}T15:00:00.000Z`),
    },
  });

  it("tells the Event Foxer of each event held on the blocked day", async () => {
    db.venueTx.mockResolvedValue([
      row("e1", "host1", "2026-12-05"),
      row("e2", "host2", "2026-12-05"),
      row("e3", "host3", "2026-12-09"),
    ]);

    const n = await EventConflictSvc.notifyDayBlocked(
      "v1",
      at("2026-12-05T00:00:00.000Z"),
      NOW,
    );

    expect(n).toBe(2);
    const sent = db.notify.mock.calls.map((c) => c[0]);
    expect(sent.map((s) => s.userId)).toEqual(["host1", "host2"]);
    expect(sent[0]).toMatchObject({
      type: "EVENT_CONFLICT",
      metadata: {
        eventId: "e1",
        reason: "date_blocked",
        // A valid page on the web, and the booked-event screen on mobile.
        link: "/creator-dashboard/events?eventId=e1",
      },
    });
    expect(sent[0].message).toContain("Sky Hall");
    expect(sent[0].message).toContain("2026-12-05");
  });

  it("tells a host once about one event, however many rows clash", async () => {
    db.venueTx.mockResolvedValue([
      row("e1", "host1", "2026-12-05"),
      row("e1", "host1", "2026-12-05"),
    ]);

    await EventConflictSvc.notifyDayBlocked(
      "v1",
      at("2026-12-05T00:00:00.000Z"),
      NOW,
    );

    expect(db.notify).toHaveBeenCalledTimes(1);
  });

  it("says nothing when no event is held that day", async () => {
    db.venueTx.mockResolvedValue([row("e1", "host1", "2026-12-09")]);

    const n = await EventConflictSvc.notifyDayBlocked(
      "v1",
      at("2026-12-05T00:00:00.000Z"),
      NOW,
    );

    expect(n).toBe(0);
    expect(db.notify).not.toHaveBeenCalled();
  });

  it("keeps going when one notification cannot be sent", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.notify.mockRejectedValueOnce(new Error("socket down"));
    db.venueTx.mockResolvedValue([
      row("e1", "host1", "2026-12-05"),
      row("e2", "host2", "2026-12-05"),
    ]);

    await EventConflictSvc.notifyDayBlocked(
      "v1",
      at("2026-12-05T00:00:00.000Z"),
      NOW,
    );

    expect(db.notify).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("EventConflictSvc.notifyListingGone", () => {
  it("tells the Event Foxer of every event that has the gear booked, once each", async () => {
    db.assetTx.mockResolvedValue([
      {
        asset: { name: "Sound system" },
        event: { id: "e1", name: "Garden wedding", organizerId: "host1" },
      },
      {
        asset: { name: "Sound system" },
        event: { id: "e1", name: "Garden wedding", organizerId: "host1" },
      },
      {
        asset: { name: "Sound system" },
        event: { id: "e2", name: "Reunion", organizerId: "host2" },
      },
    ]);

    const n = await EventConflictSvc.notifyListingGone("asset", "asset1", NOW);

    expect(n).toBe(3);
    const sent = db.notify.mock.calls.map((c) => c[0]);
    expect(sent.map((s) => s.userId)).toEqual(["host1", "host2"]);
    expect(sent[0]).toMatchObject({
      type: "EVENT_CONFLICT",
      metadata: {
        eventId: "e1",
        reason: "unavailable",
        link: "/creator-dashboard/events?eventId=e1",
      },
    });
    expect(sent[0].message).toContain("Sound system");
    expect(db.assetTx.mock.calls[0][0].where.assetId).toBe("asset1");
  });

  it("looks up services by the service id", async () => {
    db.serviceTx.mockResolvedValue([
      {
        service: { name: "Photographer" },
        event: { id: "e1", name: "Garden wedding", organizerId: "host1" },
      },
    ]);

    await EventConflictSvc.notifyListingGone("service", "svc1", NOW);

    expect(db.serviceTx.mock.calls[0][0].where.serviceId).toBe("svc1");
    expect(db.notify.mock.calls[0][0].message).toContain("Photographer");
  });

  it("only looks at upcoming, live bookings", async () => {
    db.assetTx.mockResolvedValue([]);

    await EventConflictSvc.notifyListingGone("asset", "asset1", NOW);

    const where = db.assetTx.mock.calls[0][0].where;
    expect(where.status.in).toEqual(
      expect.arrayContaining(["pending", "approved"]),
    );
    expect(where.status.in).not.toContain("rejected");
    expect(where.event.endAt).toEqual({ gt: NOW });
  });
});

describe("EventConflictSvc.eventDetail", () => {
  it("offers the unpaid booking for the host to decline, and none once paid", async () => {
    db.eventOne.mockResolvedValue(event());
    db.unpaid.mockResolvedValue({ id: "b9" });
    expect(
      (await EventConflictSvc.eventDetail("host1", "e1")).declinableBookingId,
    ).toBe("b9");
    expect(db.unpaid.mock.calls[0][0].where).toEqual({
      eventId: "e1",
      status: "pending",
    });

    db.unpaid.mockResolvedValue(null);
    expect(
      (await EventConflictSvc.eventDetail("host1", "e1")).declinableBookingId,
    ).toBeNull();
  });

  it("asks for the event only if the person is its host", async () => {
    db.eventOne.mockResolvedValue(event());

    await EventConflictSvc.eventDetail("host1", "e1");

    expect(db.eventOne.mock.calls[0][0].where).toEqual({
      id: "e1",
      organizerId: "host1",
    });
  });

  it("is not found for another host's event or one that does not exist", async () => {
    db.eventOne.mockResolvedValue(null);

    await expect(
      EventConflictSvc.eventDetail("stranger", "e1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lists every Supplier, marking the ones to replace and why", async () => {
    db.eventOne.mockResolvedValue(
      event({
        eventStatus: "pending",
        assetTransactions: [
          assetTx({ status: "rejected", rejectionReason: "supplier_declined" }),
        ],
        serviceTransactions: [serviceTx()],
        venueTransactions: [
          venueTx({
            venue: {
              name: "Sky Hall",
              blockedDates: [at("2026-12-05T00:00:00.000Z")],
            },
          }),
        ],
      }),
    );

    const out = await EventConflictSvc.eventDetail("host1", "e1");

    expect(out).toMatchObject({
      eventId: "e1",
      eventName: "Garden wedding",
      eventStatus: "pending",
    });
    expect(
      out.suppliers.map((s) => [s.kind, s.itemName, s.status, s.reason]),
    ).toEqual([
      ["asset", "Sound system", "rejected", "declined"],
      ["service", "Photographer", "approved", null],
      ["venue", "Sky Hall", "approved", "date_blocked"],
    ]);
  });

  it("leaves out a cancelled line but keeps one a Provider turned down", async () => {
    db.eventOne.mockResolvedValue(
      event({
        assetTransactions: [assetTx({ id: "gone", status: "cancelled" })],
        serviceTransactions: [
          serviceTx({
            id: "no",
            status: "rejected",
            rejectionReason: "provider_declined",
          }),
        ],
      }),
    );

    const out = await EventConflictSvc.eventDetail("host1", "e1");

    expect(out.suppliers.map((s) => s.transactionId)).toEqual(["no"]);
    // Turned down is not a Supplier leaving a booked event.
    expect(out.suppliers[0].reason).toBeNull();
  });

  it("shows an event with no Suppliers as an empty list", async () => {
    db.eventOne.mockResolvedValue(event());

    const out = await EventConflictSvc.eventDetail("host1", "e1");

    expect(out.suppliers).toEqual([]);
  });

  describe("replacements (ADR 0010)", () => {
    const declined = assetTx({
      id: "old",
      status: "rejected",
      rejectionReason: "supplier_declined",
    });

    it("reads only proposals waiting for an answer or accepted", async () => {
      db.eventOne.mockResolvedValue(event());

      await EventConflictSvc.eventDetail("host1", "e1");

      const select = db.eventOne.mock.calls[0][0].select;
      expect(select.editProposals.where).toEqual({
        status: { in: ["pending", "accepted"] },
      });
    });

    it("shows the proposal waiting on a line that needs replacing", async () => {
      db.eventOne.mockResolvedValue(
        event({
          assetTransactions: [declined],
          editProposals: [
            {
              id: "p1",
              status: "pending",
              replacesTransactionId: "old",
              appliedTransactionId: null,
            },
          ],
        }),
      );

      const [row] = (await EventConflictSvc.eventDetail("host1", "e1"))
        .suppliers;

      expect(row).toMatchObject({
        transactionId: "old",
        reason: "declined",
        pendingProposalId: "p1",
      });
    });

    it("drops a replaced line and lists its replacement awaiting its Supplier", async () => {
      const e = event({
        assetTransactions: [
          declined,
          assetTx({ id: "new", status: "pending_provider_confirmation" }),
        ],
        editProposals: [
          {
            id: "p1",
            status: "accepted",
            replacesTransactionId: "old",
            appliedTransactionId: "new",
          },
        ],
      });
      db.eventOne.mockResolvedValue(e);
      db.events.mockResolvedValue([e]);

      const out = await EventConflictSvc.eventDetail("host1", "e1");

      expect(
        out.suppliers.map((s) => [
          s.transactionId,
          s.reason,
          s.pendingProposalId,
        ]),
      ).toEqual([["new", null, null]]);
      expect(await EventConflictSvc.needsAttention("host1", NOW)).toEqual([]);
    });

    it.each(["provider_declined", "deadline_expired"])(
      "flags a replacement again when its new Supplier lets it go (%s)",
      async (rejectionReason) => {
        const e = event({
          assetTransactions: [
            declined,
            assetTx({ id: "new", status: "rejected", rejectionReason }),
          ],
          editProposals: [
            {
              id: "p1",
              status: "accepted",
              replacesTransactionId: "old",
              appliedTransactionId: "new",
            },
          ],
        });
        db.eventOne.mockResolvedValue(e);
        db.events.mockResolvedValue([e]);

        const out = await EventConflictSvc.eventDetail("host1", "e1");
        expect(out.suppliers.map((s) => [s.transactionId, s.reason])).toEqual([
          ["new", "declined"],
        ]);
        const [attention] = await EventConflictSvc.needsAttention("host1", NOW);
        expect(attention.issues.map((i) => i.transactionId)).toEqual(["new"]);
      },
    );

    it("does not flag an ordinary line a Provider turned down", async () => {
      db.eventOne.mockResolvedValue(
        event({
          assetTransactions: [
            assetTx({
              status: "rejected",
              rejectionReason: "provider_declined",
            }),
          ],
        }),
      );

      const [row] = (await EventConflictSvc.eventDetail("host1", "e1"))
        .suppliers;
      expect(row.reason).toBeNull();
    });
  });
});
