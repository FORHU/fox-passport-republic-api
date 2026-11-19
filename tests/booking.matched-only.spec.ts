import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ADR 0010: with AUTO_BOOK_MATCHED_ONLY, a package Supplier the Event Foxer is
 * not matched with is asked first (24 hours to answer) and told; the booking
 * says how many must answer before it can be paid. Off, nothing changes.
 */

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("../src/config", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get AUTO_BOOK_MATCHED_ONLY() {
      return flag.on;
    },
  };
});
const notify = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: notify },
}));

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
  ownerCommissionPct: vi.fn(() => 10),
}));
vi.mock("../src/modules/event-template/event-template.service", () => ({
  default: templates,
}));

// The price breakdown (#264): one priced line per included row. Excluded
// `tv2` has no line.
const line = (itemId: string, price: number) => ({
  kind: "asset",
  itemId,
  category: null,
  quantity: 1,
  unitPrice: price,
  price,
  commissionPct: 10,
  commission: price / 10,
  platformFeePct: 5,
  platformFee: price / 20,
  processingFeePct: 3,
  processingFee: (price * 3) / 100,
  lineTotal: price * 1.18,
});
const pricing = vi.hoisted(() => ({ calculateEventBreakdown: vi.fn() }));
vi.mock("../src/modules/pricing/pricing.service", () => ({
  default: pricing,
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

const TEMPLATE = {
  id: "t1",
  ownerId: "foxer",
  name: "Fiesta Birthday",
  maxAttendees: null,
  templateAssets: [
    {
      id: "ta1",
      assetId: "a1",
      asset: { ownerId: "o1", name: "Sound system" },
      quantity: 2,
      matched: false,
    },
  ],
  templateServices: [
    {
      id: "ts1",
      serviceId: "s1",
      service: { ownerId: "o2", name: "Photographer" },
      matched: true,
    },
  ],
  templateVenues: [
    {
      id: "tv1",
      venueId: "v1",
      venue: { mayorId: "m1", name: "Sky Hall" },
      matched: false,
    },
  ],
};

const book = () =>
  BookingSvc.bookFromTemplate({
    userId: "guest",
    templateId: "t1",
    guestCount: 50,
    startAt: new Date("2027-06-01T10:00:00Z"),
    endAt: new Date("2027-06-01T22:00:00Z"),
  });

const rows = () =>
  eventRepo.createEscrowTransactions.mock.calls[0][1] as unknown as {
    assets: Record<string, unknown>[];
    services: Record<string, unknown>[];
    venues: Record<string, unknown>[];
  };

beforeEach(() => {
  vi.clearAllMocks();
  flag.on = true;
  templates.getPublicTemplateWithItemOwners.mockResolvedValue(
    structuredClone(TEMPLATE),
  );
  pricing.calculateEventBreakdown.mockResolvedValue({
    lines: [line("ta1", 3000), line("ts1", 5000), line("tv1", 10000)],
    itemsTotal: 18000,
    commissionTotal: 1800,
    platformFee: 900,
    processingFee: 540,
    total: 21240,
    estimatedTotal: 21240,
    currency: "PHP",
  });
  availability.reserve.mockResolvedValue(undefined);
  vi.spyOn(BookingSvc, "createBooking").mockResolvedValue({
    id: "b1",
  } as never);
  vi.spyOn(BookingSvc, "invalidateCaches").mockResolvedValue(undefined);
});

describe("booking only matched Suppliers automatically", () => {
  it("asks an unmatched Supplier first, with 24 hours to answer", async () => {
    const before = Date.now();
    await book();

    const { assets, services, venues } = rows();
    expect(assets[0].status).toBe("pending_provider_confirmation");
    expect(venues[0].status).toBe("pending_provider_confirmation");
    const due = (assets[0].confirmationDeadline as Date).getTime();
    expect(due - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
    expect(due - before).toBeLessThanOrEqual(24 * 3_600_000 + 5000);
    // Matched: booked as before.
    expect(services[0].status).toBe("pending");
    expect(services[0].confirmationDeadline).toBeUndefined();
  });

  it("tells each Supplier asked first, and says how many must answer", async () => {
    const out = await book();

    expect(out.awaitingConfirmation).toBe(2);
    expect(
      notify.mock.calls.map((c) => (c[0] as { userId: string }).userId).sort(),
    ).toEqual(["m1", "o1"]);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: "EVENT_ITEM_REQUEST",
      metadata: { eventId: "e1", bookingId: "b1" },
    });
  });

  it("does not ask a Supplier whose item the citizen left out", async () => {
    await BookingSvc.bookFromTemplate({
      userId: "guest",
      templateId: "t1",
      guestCount: 50,
      startAt: new Date("2027-06-01T10:00:00Z"),
      endAt: new Date("2027-06-01T22:00:00Z"),
      excludedAssetIds: ["ta1"],
    });

    expect(
      notify.mock.calls.map((c) => (c[0] as { userId: string }).userId),
    ).toEqual(["m1"]);
  });

  it("keeps a booking if a request can't be sent", async () => {
    notify.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(book()).resolves.toMatchObject({ awaitingConfirmation: 2 });
  });

  it("changes nothing while the flag is off", async () => {
    flag.on = false;

    const out = await book();

    const { assets, venues } = rows();
    expect(assets[0].status).toBe("pending");
    expect(venues[0].status).toBe("pending");
    expect(out.awaitingConfirmation).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
