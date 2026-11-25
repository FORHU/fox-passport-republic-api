import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  eventFindUnique: vi.fn(),
  eventUpdate: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingFindUnique: vi.fn(),
  bookingUpdate: vi.fn(),
  assetTxFindMany: vi.fn(),
  assetTxUpdateMany: vi.fn(),
  serviceTxFindMany: vi.fn(),
  serviceTxUpdateMany: vi.fn(),
  venueTxFindMany: vi.fn(),
  venueTxUpdateMany: vi.fn(),
  proposalCreate: vi.fn(),
  proposalUpdateMany: vi.fn(),
  proposalCount: vi.fn(),
  executeRaw: vi.fn(),
  validate: vi.fn(),
  eventDetail: vi.fn(),
  matches: vi.fn(),
  venuePartners: vi.fn(),
  notify: vi.fn(),
  startInbox: vi.fn(),
  sendMessage: vi.fn(),
  announce: vi.fn(),
}));

vi.mock("../src/utils/prisma", () => {
  const prisma = {
    event: {
      findFirst: db.eventFindFirst,
      findUnique: db.eventFindUnique,
      update: db.eventUpdate,
    },
    booking: {
      findMany: db.bookingFindMany,
      findUnique: db.bookingFindUnique,
      update: db.bookingUpdate,
    },
    eventAssetTransaction: {
      findMany: db.assetTxFindMany,
      updateMany: db.assetTxUpdateMany,
    },
    eventServiceTransaction: {
      findMany: db.serviceTxFindMany,
      updateMany: db.serviceTxUpdateMany,
    },
    eventVenueTransaction: {
      findMany: db.venueTxFindMany,
      updateMany: db.venueTxUpdateMany,
    },
    eventEditProposal: {
      create: db.proposalCreate,
      updateMany: db.proposalUpdateMany,
      count: db.proposalCount,
    },
    $executeRaw: db.executeRaw,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma };
});
vi.mock("../src/modules/availability/availability.service", () => ({
  default: { validateForCheckout: db.validate },
}));
vi.mock("../src/modules/event-transaction/event-conflict.service", () => ({
  default: { eventDetail: db.eventDetail },
  eventLink: (id: string) => `/creator-dashboard/events?eventId=${id}`,
}));
vi.mock("../src/modules/event-template/template-partners", () => ({
  acceptedMatchListings: db.matches,
  approvedVenuePartners: db.venuePartners,
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: db.notify },
}));
vi.mock("../src/modules/conversations/conversation.service", () => ({
  default: {
    startInboxConversation: db.startInbox,
    sendMessage: db.sendMessage,
  },
}));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: db.announce,
}));

import EventRescheduleSvc, {
  RESCHEDULE_PROPOSAL_HOURS,
} from "../src/modules/event-transaction/event-reschedule.service";
import { AvailabilityConflictError } from "../src/modules/availability/availability.types";

const D = (n: number) => new Prisma.Decimal(n);
const HOUR = 3_600_000;
const NOW = new Date("2026-11-25T10:00:00.000Z");
const START = new Date("2026-12-05T10:00:00.000Z");
const END = new Date("2026-12-05T15:00:00.000Z");
const NEW_START = new Date("2026-12-12T09:00:00.000Z");
const NEW_END = new Date("2026-12-12T14:00:00.000Z");

const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  name: "Garden wedding",
  startAt: START,
  endAt: END,
  templateId: "t1",
  clientId: "citizen1",
  organizerId: "host1",
  ...over,
});

const booking = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  userId: "citizen1",
  status: "confirmed",
  totalAmount: D(5000),
  startAt: START,
  endAt: END,
  ...over,
});

/** Sound system (a partner's), DJ (not a partner), Grand Hall (not a partner). */
const lines = () => {
  db.assetTxFindMany.mockResolvedValue([
    {
      id: "tx-sound",
      status: "approved",
      quantity: 2,
      providerId: "prov-sound",
      assetId: "asset-sound",
      asset: { name: "Sound system" },
      provider: { name: "Ana Audio" },
    },
  ]);
  db.serviceTxFindMany.mockResolvedValue([
    {
      id: "tx-dj",
      status: "approved",
      providerId: "prov-dj",
      serviceId: "svc-dj",
      service: { name: "DJ set" },
      provider: { name: "Dee Jay" },
    },
  ]);
  db.venueTxFindMany.mockResolvedValue([
    {
      id: "tx-hall",
      status: "pending",
      providerId: "mayor1",
      venueId: "venue-hall",
      venue: { name: "Grand Hall" },
      provider: { name: "Mayor May" },
    },
  ]);
};

const detail = (suppliers: Record<string, unknown>[] = []) => ({
  suppliers,
});

const proposal = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  eventId: "e1",
  bookingId: "b1",
  proposedPrice: D(5000),
  proposedStartAt: NEW_START,
  proposedEndAt: NEW_END,
  previousStartAt: START,
  ...over,
});

beforeEach(() => {
  Object.values(db).forEach((f) => f.mockReset());
  db.eventFindFirst.mockResolvedValue(event());
  db.eventFindUnique.mockResolvedValue(event());
  db.bookingFindMany.mockResolvedValue([booking()]);
  db.bookingFindUnique.mockResolvedValue(booking());
  lines();
  db.eventDetail.mockResolvedValue(detail());
  db.matches.mockImplementation(async (_h: string, kind: string) =>
    kind === "asset" ? new Set(["asset-sound"]) : new Set(),
  );
  db.venuePartners.mockResolvedValue(new Set());
  db.validate.mockResolvedValue(undefined);
  db.proposalCount.mockResolvedValue(0);
  db.proposalUpdateMany.mockResolvedValue({ count: 1 });
  db.proposalCreate.mockImplementation(async ({ data }) => ({
    id: "r1",
    ...data,
  }));
  db.notify.mockResolvedValue({});
  db.startInbox.mockResolvedValue({ id: "thread1" });
  db.sendMessage.mockResolvedValue({});
  db.executeRaw.mockResolvedValue(1);
  db.eventUpdate.mockResolvedValue({});
  db.bookingUpdate.mockResolvedValue({});
  db.assetTxUpdateMany.mockResolvedValue({ count: 1 });
  db.serviceTxUpdateMany.mockResolvedValue({ count: 1 });
  db.venueTxUpdateMany.mockResolvedValue({ count: 1 });
});

describe("EventRescheduleSvc.preview", () => {
  it("is not found for another host's event", async () => {
    db.eventFindFirst.mockResolvedValue(null);

    await expect(
      EventRescheduleSvc.preview("stranger", "e1", NEW_START, NOW),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.eventFindFirst.mock.calls[0][0].where).toEqual({
      id: "e1",
      organizerId: "stranger",
    });
  });

  it("checks every line on the new dates, keeping the event's length and price", async () => {
    db.validate.mockImplementation(async (_tx, _b, [item]) => {
      if (item.itemId === "svc-dj") {
        throw new AvailabilityConflictError("busy", "service", "svc-dj");
      }
    });

    const out = await EventRescheduleSvc.preview("host1", "e1", NEW_START, NOW);

    expect(out).toMatchObject({
      bookingId: "b1",
      proposedStartAt: NEW_START,
      proposedEndAt: NEW_END,
      available: false,
    });
    expect(out.priceDelta.toNumber()).toBe(0);
    expect(out.proposedPrice.toNumber()).toBe(5000);
    expect(
      out.lines.map((l) => [l.itemName, l.available, l.reconfirm]),
    ).toEqual([
      ["Sound system", true, false],
      ["DJ set", false, true],
      ["Grand Hall", true, true],
    ]);
    // The booking's own lines don't count against the new dates.
    const [, bookingId, [sound]] = db.validate.mock.calls[0];
    expect(bookingId).toBe("b1");
    expect(sound).toEqual({
      kind: "asset",
      itemId: "asset-sound",
      dateRange: { start: NEW_START, end: NEW_END },
      eventId: undefined,
      quantity: 2,
    });
    expect(db.validate.mock.calls[1][2][0].eventId).toBe("e1");
  });

  it("skips a line that needs replacing first, but checks a blocked day", async () => {
    db.eventDetail.mockResolvedValue(
      detail([
        {
          kind: "service",
          transactionId: "tx-dj",
          itemName: "DJ set",
          supplierName: "Dee Jay",
          reason: "unavailable",
        },
        {
          kind: "venue",
          transactionId: "tx-hall",
          itemName: "Grand Hall",
          supplierName: "Mayor May",
          reason: "date_blocked",
        },
        {
          kind: "asset",
          transactionId: "tx-gone",
          itemName: "Old lights",
          supplierName: "Lux",
          reason: "declined",
        },
      ]),
    );

    const out = await EventRescheduleSvc.preview("host1", "e1", NEW_START, NOW);

    expect(out.lines.map((l) => l.transactionId)).toEqual([
      "tx-sound",
      "tx-hall",
    ]);
    expect(out.skipped.map((s) => [s.transactionId, s.reason])).toEqual([
      ["tx-dj", "unavailable"],
      ["tx-gone", "declined"],
    ]);
  });

  it("counts a venue the Mayor affiliated with the host as a partner", async () => {
    db.venuePartners.mockResolvedValue(new Set(["venue-hall"]));

    const out = await EventRescheduleSvc.preview("host1", "e1", NEW_START, NOW);

    expect(out.lines.find((l) => l.kind === "venue")!.reconfirm).toBe(false);
  });
});

describe("EventRescheduleSvc.propose", () => {
  const propose = (startAt = NEW_START, note?: string) =>
    EventRescheduleSvc.propose("host1", "e1", { startAt, note }, NOW);

  it("records the old and new dates and tells the citizen in the event's chat", async () => {
    const p = await propose(NEW_START, "  The garden floods in December ");

    expect(db.proposalCreate.mock.calls[0][0].data).toMatchObject({
      type: "reschedule",
      eventId: "e1",
      bookingId: "b1",
      proposedById: "host1",
      proposedStartAt: NEW_START,
      proposedEndAt: NEW_END,
      previousStartAt: START,
      previousEndAt: END,
      note: "The garden floods in December",
      expiresAt: new Date(NOW.getTime() + RESCHEDULE_PROPOSAL_HOURS * HOUR),
    });
    expect(p.priceDelta.toNumber()).toBe(0);
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "citizen1",
        type: "EVENT_RESCHEDULE_PROPOSED",
        metadata: {
          link: "/booking/b1",
          bookingId: "b1",
          proposalId: "r1",
          proposalType: "reschedule",
        },
      }),
    );
    expect(db.startInbox).toHaveBeenCalledWith("host1", {
      eventId: "e1",
      guestId: "citizen1",
    });
    expect(db.sendMessage.mock.calls[0][0]).toMatchObject({
      conversationId: "thread1",
      senderId: "host1",
    });
    expect(db.sendMessage.mock.calls[0][0].content).toContain(
      "The garden floods in December",
    );
    expect(db.announce).toHaveBeenCalledWith("citizen1", "bookings");
  });

  it("refuses when a Supplier isn't free then, naming them", async () => {
    db.validate.mockImplementation(async (_tx, _b, [item]) => {
      if (item.kind !== "asset") {
        throw new AvailabilityConflictError("busy", item.kind, item.itemId);
      }
    });

    await expect(propose()).rejects.toMatchObject({
      status: 409,
      code: "AVAILABILITY_CONFLICT",
      message: expect.stringContaining(
        "DJ set and Grand Hall aren't free then",
      ),
    });
    expect(db.proposalCreate).not.toHaveBeenCalled();
  });

  it("refuses while another change waits for an answer", async () => {
    db.proposalCount.mockResolvedValue(1);

    await expect(propose()).rejects.toMatchObject({
      status: 409,
      code: "PROPOSAL_PENDING",
    });
    // An overdue date change is ended first, so it doesn't block a new one.
    expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
      where: {
        bookingId: "b1",
        type: "reschedule",
        status: "pending",
        expiresAt: { lt: NOW },
      },
      data: { status: "expired" },
    });
  });

  it("refuses when another date change got there first", async () => {
    db.proposalCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "x",
      }),
    );

    await expect(propose()).rejects.toMatchObject({
      code: "PROPOSAL_PENDING",
    });
  });

  it("refuses an event that isn't a package", async () => {
    db.eventFindFirst.mockResolvedValue(event({ templateId: null }));

    await expect(propose()).rejects.toMatchObject({
      status: 409,
      code: "RESCHEDULE_NOT_SUPPORTED",
    });
  });

  it("refuses a booking that can't change, and an event with two bookings", async () => {
    db.bookingFindMany.mockResolvedValue([]);
    await expect(propose()).rejects.toMatchObject({
      code: "BOOKING_NOT_EDITABLE",
    });

    db.bookingFindMany.mockResolvedValue([booking(), booking({ id: "b2" })]);
    await expect(propose()).rejects.toMatchObject({
      code: "RESCHEDULE_NOT_SUPPORTED",
    });
  });

  it("refuses the same date, and too little notice either side", async () => {
    await expect(propose(START)).rejects.toMatchObject({
      status: 400,
      code: "SAME_DATE",
    });
    await expect(
      propose(new Date(NOW.getTime() + 47 * HOUR)),
    ).rejects.toMatchObject({ status: 400, code: "DATE_TOO_SOON" });

    db.eventFindFirst.mockResolvedValue(
      event({
        startAt: new Date(NOW.getTime() + 30 * HOUR),
        endAt: new Date(NOW.getTime() + 35 * HOUR),
      }),
    );
    await expect(propose()).rejects.toMatchObject({ code: "DATE_TOO_SOON" });
  });

  it("keeps the proposal when telling the citizen fails", async () => {
    db.notify.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(propose()).resolves.toMatchObject({ id: "r1" });
  });
});

describe("EventRescheduleSvc.accept", () => {
  it("moves the event and booking, and asks Suppliers who aren't partners to confirm", async () => {
    const out = await EventRescheduleSvc.accept(proposal(), NOW);

    expect(out).toEqual({
      proposalId: "r1",
      eventId: "e1",
      startAt: NEW_START,
      endAt: NEW_END,
    });
    expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: "r1", status: "pending" },
      data: { status: "accepted", respondedAt: NOW },
    });
    expect(db.validate.mock.calls[0][2]).toHaveLength(3);
    expect(db.eventUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { startAt: NEW_START, endAt: NEW_END },
    });
    expect(db.bookingUpdate).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { startAt: NEW_START, endAt: NEW_END, reminderSentAt: null },
    });
    const toConfirm = {
      status: "pending_provider_confirmation",
      confirmationDeadline: new Date(NOW.getTime() + 24 * HOUR),
    };
    expect(db.serviceTxUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["tx-dj"] } },
      data: toConfirm,
    });
    expect(db.venueTxUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["tx-hall"] } },
      data: toConfirm,
    });
    // The partner's sound system stays booked.
    expect(db.assetTxUpdateMany).not.toHaveBeenCalled();
  });

  it("tells the host, the partner and the Suppliers who confirm", async () => {
    await EventRescheduleSvc.accept(proposal(), NOW);

    const sent = Object.fromEntries(
      db.notify.mock.calls.map((c) => [c[0].userId, c[0]]),
    );
    expect(sent.host1).toMatchObject({
      type: "EVENT_EDIT_ACCEPTED",
      metadata: expect.objectContaining({ proposalType: "reschedule" }),
    });
    expect(sent["prov-sound"].type).toBe("EVENT_RESCHEDULED");
    expect(sent["prov-dj"].type).toBe("EVENT_RESCHEDULE_REQUEST");
    expect(sent.mayor1.metadata.link).toBe("/foxer/marketplace-requests");
    expect(db.announce).toHaveBeenCalledWith("citizen1", "bookings");
  });

  it("applies once when two answers race", async () => {
    db.proposalUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      EventRescheduleSvc.accept(proposal(), NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.eventUpdate).not.toHaveBeenCalled();
  });

  it("stays answerable when a Supplier was taken on the new date meanwhile", async () => {
    db.validate.mockRejectedValue(
      new AvailabilityConflictError("taken", "venue", "venue-hall"),
    );

    await expect(
      EventRescheduleSvc.accept(proposal(), NOW),
    ).rejects.toMatchObject({
      code: "AVAILABILITY_CONFLICT",
      message: expect.stringContaining("Grand Hall"),
    });
    expect(db.eventUpdate).not.toHaveBeenCalled();
    // Only the claim inside the rolled-back transaction touched the proposal.
    expect(db.proposalUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("ends the proposal when the event moved since", async () => {
    db.eventFindUnique.mockResolvedValue(
      event({ startAt: new Date("2026-12-06T10:00:00.000Z") }),
    );

    await expect(
      EventRescheduleSvc.accept(proposal(), NOW),
    ).rejects.toMatchObject({ code: "PROPOSAL_STALE" });
    expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: "r1", status: "pending" },
      data: { status: "expired" },
    });
  });

  it("ends the proposal when the total changed since", async () => {
    db.bookingFindUnique.mockResolvedValue(booking({ totalAmount: D(5200) }));

    await expect(
      EventRescheduleSvc.accept(proposal(), NOW),
    ).rejects.toMatchObject({ code: "PROPOSAL_PRICE_CHANGED" });
    expect(db.proposalUpdateMany.mock.calls[0][0].data).toEqual({
      status: "expired",
    });
  });

  it("refuses once the new date is too close", async () => {
    await expect(
      EventRescheduleSvc.accept(
        proposal(),
        new Date(NEW_START.getTime() - 10 * HOUR),
      ),
    ).rejects.toMatchObject({ code: "DATE_TOO_SOON" });
  });

  it("waits while another change to the booking is open", async () => {
    db.proposalCount.mockResolvedValue(1);

    await expect(
      EventRescheduleSvc.accept(proposal(), NOW),
    ).rejects.toMatchObject({ code: "PROPOSAL_PENDING" });
    expect(db.eventUpdate).not.toHaveBeenCalled();
  });
});
