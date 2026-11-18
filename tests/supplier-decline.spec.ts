import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  transition: vi.fn(),
  notify: vi.fn(),
  event: vi.fn(),
  user: vi.fn(),
  booking: vi.fn(),
  asset: vi.fn(),
  service: vi.fn(),
  venue: vi.fn(),
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
    event: { findUnique: db.event },
    user: { findUnique: db.user },
    booking: { findUnique: db.booking },
    eventAssetTransaction: { findUnique: db.asset },
    eventServiceTransaction: { findUnique: db.service },
    eventVenueTransaction: { findUnique: db.venue },
  },
}));

vi.mock("../src/modules/transaction-status/transaction-status.service", () => ({
  default: { transition: db.transition },
}));

vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: db.notify },
}));

// The other modules the service imports are not touched by reviewItem.
vi.mock(
  "../src/modules/event-transaction/event-transaction.repository",
  () => ({
    default: {},
  }),
);
vi.mock("../src/modules/event-request/event-request.repository", () => ({
  default: {},
}));
vi.mock("../src/modules/event-template/event-template.repository", () => ({
  default: {},
}));
vi.mock("../src/modules/pricing/pricing.service", () => ({ default: {} }));
vi.mock("../src/modules/availability/availability.service", () => ({
  default: {},
}));

import EventTransactionSvc from "../src/modules/event-transaction/event-transaction.service";

const row = {
  id: "tx1",
  eventId: "e1",
  bookingId: "b1",
  providerId: "prov1",
};

beforeEach(() => {
  Object.values(db).forEach((f) => f.mockReset());
  db.transition.mockResolvedValue(row);
  db.notify.mockResolvedValue({});
  db.event.mockResolvedValue({
    name: "Garden wedding",
    organizerId: "host1",
    clientId: "citizen1",
  });
  db.user.mockResolvedValue({ name: "Maria Provider" });
  db.booking.mockResolvedValue({ userId: "citizen1" });
  db.asset.mockResolvedValue({ asset: { name: "Sound system" } });
  db.service.mockResolvedValue({ service: { name: "Photographer" } });
  db.venue.mockResolvedValue({ venue: { name: "Sky Hall" } });
});

describe("EventTransactionSvc.reviewItem with a decline", () => {
  it("tells the Event Foxer which Supplier left which event, and the citizen", async () => {
    await EventTransactionSvc.reviewItem("tx1", "asset", "decline", "prov1");

    expect(db.transition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "decline", actorId: "prov1" }),
    );
    expect(db.notify).toHaveBeenCalledTimes(2);
    const [host, citizen] = db.notify.mock.calls.map((c) => c[0]);
    expect(host).toMatchObject({
      userId: "host1",
      type: "SUPPLIER_DECLINED",
      metadata: {
        eventId: "e1",
        transactionId: "tx1",
        kind: "asset",
        link: "/creator-dashboard/events?eventId=e1",
      },
    });
    expect(host.message).toContain("Maria Provider");
    expect(host.message).toContain("Sound system");
    expect(host.message).toContain("Garden wedding");
    expect(citizen).toMatchObject({
      userId: "citizen1",
      type: "SUPPLIER_DECLINED",
      // The citizen goes to their booking, not the host's event page.
      metadata: { link: "/bookings/b1" },
    });
  });

  it("says the Supplier is busy with another booking, and passes that on", async () => {
    await EventTransactionSvc.reviewItem(
      "tx1",
      "asset",
      "decline",
      "prov1",
      "busy",
    );

    expect(db.transition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "decline", cause: "busy" }),
    );
    const host = db.notify.mock.calls[0][0];
    expect(host.message).toContain("busy with another booking");
  });

  it("names a service and a venue by their own names", async () => {
    await EventTransactionSvc.reviewItem("tx1", "service", "decline", "prov1");
    await EventTransactionSvc.reviewItem("tx1", "venue", "decline", "prov1");

    const messages = db.notify.mock.calls.map((c) => c[0].message as string);
    expect(messages.some((m) => m.includes("Photographer"))).toBe(true);
    expect(messages.some((m) => m.includes("Sky Hall"))).toBe(true);
  });

  it("sends one notification when the host is also the citizen", async () => {
    db.event.mockResolvedValue({
      name: "Garden wedding",
      organizerId: "host1",
      clientId: "host1",
    });
    db.booking.mockResolvedValue({ userId: "host1" });

    await EventTransactionSvc.reviewItem("tx1", "asset", "decline", "prov1");

    expect(db.notify).toHaveBeenCalledTimes(1);
    expect(db.notify.mock.calls[0][0].userId).toBe("host1");
  });

  it("falls back to the event's client when the item has no booking yet", async () => {
    db.transition.mockResolvedValue({ ...row, bookingId: null });

    await EventTransactionSvc.reviewItem("tx1", "asset", "decline", "prov1");

    const ids = db.notify.mock.calls.map((c) => c[0].userId);
    expect(ids).toEqual(["host1", "citizen1"]);
  });

  it("does not fail the decline when a notification cannot be sent", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.notify.mockRejectedValue(new Error("socket down"));

    const result = await EventTransactionSvc.reviewItem(
      "tx1",
      "asset",
      "decline",
      "prov1",
    );

    expect(result).toBe(row);
    spy.mockRestore();
  });

  it("does not notify for any other action", async () => {
    for (const action of ["confirm", "reject", "cancel"] as const) {
      await EventTransactionSvc.reviewItem("tx1", "asset", action, "prov1");
    }
    expect(db.notify).not.toHaveBeenCalled();
  });

  it("lets a refusal through without notifying anyone", async () => {
    db.transition.mockRejectedValue(new Error("This booking is already paid"));

    await expect(
      EventTransactionSvc.reviewItem("tx1", "asset", "decline", "prov1"),
    ).rejects.toThrow("already paid");
    expect(db.notify).not.toHaveBeenCalled();
  });
});
