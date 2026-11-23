import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  assetTxFind: vi.fn(),
  assetTxCreate: vi.fn(),
  assetTxUpdate: vi.fn(),
  assetFindMany: vi.fn(),
  assetFindOne: vi.fn(),
  templateAssetMatches: vi.fn(),
  bookingFind: vi.fn(),
  proposalCreate: vi.fn(),
  proposalFind: vi.fn(),
  proposalFindMany: vi.fn(),
  proposalUpdateMany: vi.fn(),
  proposalUpdate: vi.fn(),
  reserve: vi.fn(),
  eventDetail: vi.fn(),
  breakdown: vi.fn(),
  notify: vi.fn(),
  startInbox: vi.fn(),
  sendMessage: vi.fn(),
  bookingUpdate: vi.fn(),
  eventUpdate: vi.fn(),
  refundCreate: vi.fn(),
  refundFindMany: vi.fn(),
  intentCreate: vi.fn(),
  intentRetrieve: vi.fn(),
  intentCancel: vi.fn(),
  stripeRefund: vi.fn(),
  payments: vi.fn(),
  createPayment: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class {
    paymentIntents = {
      create: db.intentCreate,
      retrieve: db.intentRetrieve,
      cancel: db.intentCancel,
    };
    refunds = { create: db.stripeRefund };
  },
}));
vi.mock("../src/modules/payment/payment.repository", () => ({
  default: { getBookingPayments: db.payments, createPayment: db.createPayment },
}));

vi.mock("../src/utils/prisma", () => {
  const prisma = {
    eventAssetTransaction: {
      findUnique: db.assetTxFind,
      create: db.assetTxCreate,
      update: db.assetTxUpdate,
    },
    asset: {
      findMany: db.assetFindMany,
      findUnique: db.assetFindOne,
      findUniqueOrThrow: db.assetFindOne,
    },
    eventTemplateAsset: { findMany: db.templateAssetMatches },
    booking: { findUnique: db.bookingFind, update: db.bookingUpdate },
    event: { update: db.eventUpdate },
    refund: { create: db.refundCreate, findMany: db.refundFindMany },
    eventEditProposal: {
      create: db.proposalCreate,
      findUnique: db.proposalFind,
      findMany: db.proposalFindMany,
      updateMany: db.proposalUpdateMany,
      update: db.proposalUpdate,
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma };
});
vi.mock("../src/modules/availability/availability.service", () => ({
  default: { reserve: db.reserve },
}));
vi.mock("../src/modules/event-transaction/event-conflict.service", () => ({
  default: { eventDetail: db.eventDetail },
  eventLink: (id: string) => `/creator-dashboard/events?eventId=${id}`,
}));
vi.mock("../src/modules/pricing/pricing.service", () => ({
  default: { calculateEventBreakdownForLines: db.breakdown },
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

import EventEditSvc, {
  BookingNotEditableError,
  PROPOSAL_HOURS,
} from "../src/modules/event-transaction/event-edit.service";
import { AvailabilityConflictError } from "../src/modules/availability/availability.types";

const D = (n: number) => new Prisma.Decimal(n);
const NOW = new Date("2026-11-19T10:00:00.000Z");

/** The declined sound system on the host's unpriced (legacy) event. */
const line = (over: Record<string, unknown> = {}) => ({
  id: "old",
  eventId: "e1",
  bookingId: "b1",
  status: "rejected",
  quantity: 1,
  agreedPrice: D(1000),
  commissionAmount: null,
  platformFeeAmount: null,
  processingFeeAmount: null,
  asset: { id: "asset-old", category: "audio", name: "Sound system" },
  event: {
    id: "e1",
    name: "Garden wedding",
    organizerId: "host1",
    clientId: "citizen1",
    startAt: new Date("2026-12-05T10:00:00.000Z"),
    endAt: new Date("2026-12-05T15:00:00.000Z"),
    commissionPct: null,
  },
  ...over,
});

const candidate = {
  id: "asset-new",
  name: "Bigger speakers",
  category: "audio",
  price: D(1200),
  owner: { name: "Ana Audio" },
};

const needsReplacing = (pendingProposalId: string | null = null) => ({
  suppliers: [
    {
      kind: "asset",
      transactionId: "old",
      reason: "declined",
      pendingProposalId,
    },
  ],
});

const proposal = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  eventId: "e1",
  bookingId: "b1",
  proposedById: "host1",
  kind: "asset",
  replacesTransactionId: "old",
  itemId: "asset-new",
  quantity: 1,
  status: "pending",
  expiresAt: new Date(NOW.getTime() + 3_600_000),
  currentPrice: D(1000),
  proposedPrice: D(1200),
  priceDelta: D(200),
  deltaPaymentIntentId: null,
  booking: { userId: "citizen1", status: "pending" },
  event: { name: "Garden wedding", organizerId: "host1" },
  ...over,
});

beforeEach(() => {
  Object.values(db).forEach((f) => f.mockReset());
  db.assetTxFind.mockResolvedValue(line());
  db.assetFindMany.mockResolvedValue([candidate]);
  db.templateAssetMatches.mockResolvedValue([]);
  db.bookingFind.mockResolvedValue({
    id: "b1",
    userId: "citizen1",
    status: "pending",
  });
  db.eventDetail.mockResolvedValue(needsReplacing());
  db.reserve.mockResolvedValue(undefined);
  db.proposalCreate.mockImplementation(async ({ data }) => ({
    id: "p1",
    ...data,
  }));
  db.notify.mockResolvedValue({});
  db.startInbox.mockResolvedValue({ id: "thread1" });
  db.sendMessage.mockResolvedValue({});
  db.proposalUpdateMany.mockResolvedValue({ count: 1 });
  db.proposalUpdate.mockResolvedValue({});
  db.assetFindOne.mockResolvedValue({ ownerId: "prov-new", currency: "PHP" });
  db.assetTxCreate.mockResolvedValue({ id: "new", providerId: "prov-new" });
  db.assetTxUpdate.mockResolvedValue({});
  db.bookingUpdate.mockResolvedValue({});
  db.eventUpdate.mockResolvedValue({});
  db.refundCreate.mockResolvedValue({});
  db.refundFindMany.mockResolvedValue([]);
  db.intentCreate.mockResolvedValue({ id: "pi_delta", client_secret: "cs_d" });
  db.intentCancel.mockResolvedValue({});
  db.stripeRefund.mockResolvedValue({ id: "re_1", status: "succeeded" });
  db.payments.mockResolvedValue([]);
  db.createPayment.mockResolvedValue({});
});

describe("EventEditSvc.replacements", () => {
  it("is not found for a line on another host's event", async () => {
    await expect(
      EventEditSvc.replacements("stranger", "asset", "old"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("offers same-category listings other than the current one", async () => {
    const out = await EventEditSvc.replacements("host1", "asset", "old");

    expect(db.assetFindMany.mock.calls[0][0].where).toMatchObject({
      category: "audio",
      status: "available",
      deletedAt: null,
      id: { not: "asset-old" },
    });
    expect(out).toEqual([
      expect.objectContaining({
        itemId: "asset-new",
        supplierName: "Ana Audio",
      }),
    ]);
  });

  it("leaves out a listing that is taken on the event's dates", async () => {
    db.reserve.mockRejectedValue(new AvailabilityConflictError([]));

    expect(await EventEditSvc.replacements("host1", "asset", "old")).toEqual(
      [],
    );
  });

  it("marks a Supplier who accepted the host's template match as a partner, listed first", async () => {
    db.assetFindMany.mockResolvedValue([
      { ...candidate, id: "cheap", price: D(500) },
      candidate,
    ]);
    db.templateAssetMatches.mockResolvedValue([{ assetId: "asset-new" }]);

    const out = await EventEditSvc.replacements("host1", "asset", "old");

    expect(db.templateAssetMatches.mock.calls[0][0].where).toEqual({
      template: { ownerId: "host1" },
      matched: true,
      matchRequestStatus: { in: ["accepted", "secured"] },
      assetId: { in: ["cheap", "asset-new"] },
    });
    expect(out.map((c) => [c.itemId, c.partner])).toEqual([
      ["asset-new", true],
      ["cheap", false],
    ]);
  });
});

describe("EventEditSvc.propose", () => {
  const input = {
    kind: "asset" as const,
    transactionId: "old",
    itemId: "asset-new",
  };

  it("records the proposal with the price difference and tells the citizen", async () => {
    const p = await EventEditSvc.propose("host1", input, NOW);

    const data = db.proposalCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      eventId: "e1",
      bookingId: "b1",
      proposedById: "host1",
      replacesTransactionId: "old",
      itemId: "asset-new",
    });
    expect(data.currentPrice.toNumber()).toBe(1000);
    expect(data.proposedPrice.toNumber()).toBe(1200);
    expect(data.priceDelta.toNumber()).toBe(200);
    expect(data.expiresAt).toEqual(
      new Date(NOW.getTime() + PROPOSAL_HOURS * 3_600_000),
    );
    expect(p.id).toBe("p1");
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "citizen1",
        type: "EVENT_EDIT_PROPOSED",
      }),
    );
    expect(db.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "thread1", senderId: "host1" }),
    );
  });

  it("refuses a line that doesn't need replacing", async () => {
    db.eventDetail.mockResolvedValue({
      suppliers: [{ kind: "asset", transactionId: "old", reason: null }],
    });

    await expect(
      EventEditSvc.propose("host1", input, NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.proposalCreate).not.toHaveBeenCalled();
  });

  it("refuses a second proposal while one is waiting", async () => {
    db.eventDetail.mockResolvedValue(needsReplacing("p0"));

    await expect(
      EventEditSvc.propose("host1", input, NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a booking that is over", async () => {
    db.bookingFind.mockResolvedValue({
      id: "b1",
      userId: "citizen1",
      status: "completed",
    });

    await expect(
      EventEditSvc.propose("host1", input, NOW),
    ).rejects.toBeInstanceOf(BookingNotEditableError);
  });

  it("refuses a listing that isn't a same-category candidate", async () => {
    await expect(
      EventEditSvc.propose("host1", { ...input, itemId: "elsewhere" }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("turns a lost race on the unique index into a 409", async () => {
    db.proposalCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      EventEditSvc.propose("host1", input, NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps the proposal when the announcement fails", async () => {
    db.notify.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      EventEditSvc.propose("host1", input, NOW),
    ).resolves.toMatchObject({ id: "p1" });
  });
});

describe("EventEditSvc.accept", () => {
  beforeEach(() => db.proposalFind.mockResolvedValue(proposal()));

  it("adds the new line awaiting its Supplier and lets the old one go", async () => {
    db.assetTxFind.mockResolvedValue(line({ status: "approved" }));

    const out = await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(out).toEqual({ proposalId: "p1", transactionId: "new" });
    expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: "p1", status: { in: ["pending"] } },
      data: { status: "accepted", respondedAt: NOW },
    });
    expect(db.assetTxCreate.mock.calls[0][0].data).toMatchObject({
      assetId: "asset-new",
      providerId: "prov-new",
      bookingId: "b1",
      status: "pending_provider_confirmation",
    });
    expect(db.assetTxUpdate).toHaveBeenCalledWith({
      where: { id: "old" },
      data: { status: "cancelled" },
    });
    expect(db.proposalUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { appliedTransactionId: "new" },
    });
    expect(db.notify.mock.calls.map((c) => c[0].userId).sort()).toEqual([
      "host1",
      "prov-new",
    ]);
  });

  it("asks a non-partner to confirm within 24 hours", async () => {
    await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(db.assetTxCreate.mock.calls[0][0].data.confirmationDeadline).toEqual(
      new Date(NOW.getTime() + 24 * 3_600_000),
    );
    expect(
      db.notify.mock.calls.find((c) => c[0].userId === "prov-new")![0].type,
    ).toBe("EVENT_EDIT_REQUEST");
  });

  it("books a partner's line at once, with nothing to confirm", async () => {
    db.templateAssetMatches.mockResolvedValue([{ assetId: "asset-new" }]);

    await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(db.assetTxCreate.mock.calls[0][0].data).toMatchObject({
      assetId: "asset-new",
      status: "approved",
      confirmationDeadline: null,
    });
    const toSupplier = db.notify.mock.calls.find(
      (c) => c[0].userId === "prov-new",
    )![0];
    expect(toSupplier).toMatchObject({
      type: "EVENT_EDIT_BOOKED",
      title: "You're booked",
    });
    const toHost = db.notify.mock.calls.find(
      (c) => c[0].userId === "host1",
    )![0];
    expect(toHost.message).toContain("is your partner, so it's booked");
  });

  it("doesn't touch an old line that already let its slot go", async () => {
    await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(db.assetTxUpdate).not.toHaveBeenCalled();
  });

  it("is not found for anyone but the booking's citizen", async () => {
    await expect(EventEditSvc.accept("host1", "p1", NOW)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("expires an overdue proposal instead of applying it", async () => {
    db.proposalFind.mockResolvedValue(
      proposal({ expiresAt: new Date(NOW.getTime() - 1) }),
    );

    await expect(
      EventEditSvc.accept("citizen1", "p1", NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.proposalUpdateMany.mock.calls[0][0].data).toEqual({
      status: "expired",
    });
    expect(db.assetTxCreate).not.toHaveBeenCalled();
  });

  it("applies once when two answers race", async () => {
    db.proposalUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      EventEditSvc.accept("citizen1", "p1", NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.assetTxCreate).not.toHaveBeenCalled();
  });

  it("refuses once the booking is over", async () => {
    db.proposalFind.mockResolvedValue(
      proposal({ booking: { userId: "citizen1", status: "completed" } }),
    );

    await expect(
      EventEditSvc.accept("citizen1", "p1", NOW),
    ).rejects.toBeInstanceOf(BookingNotEditableError);
  });

  it("ends the proposal instead of charging a price the citizen wasn't shown", async () => {
    db.assetFindMany.mockResolvedValue([{ ...candidate, price: D(1500) }]);

    await expect(
      EventEditSvc.accept("citizen1", "p1", NOW),
    ).rejects.toMatchObject({ status: 409, code: "PROPOSAL_PRICE_CHANGED" });
    expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: "p1", status: "pending" },
      data: { status: "expired" },
    });
    expect(db.assetTxCreate).not.toHaveBeenCalled();
  });

  it("says so when the listing was taken in the meantime", async () => {
    db.reserve.mockRejectedValue(new AvailabilityConflictError([]));

    await expect(
      EventEditSvc.accept("citizen1", "p1", NOW),
    ).rejects.toMatchObject({ status: 409, code: "AVAILABILITY_CONFLICT" });
  });
});

describe("EventEditSvc.decline and withdraw", () => {
  it("records the citizen's decline and tells the host", async () => {
    db.proposalFind.mockResolvedValue(proposal());

    expect(await EventEditSvc.decline("citizen1", "p1", NOW)).toEqual({
      proposalId: "p1",
      status: "declined",
    });
    expect(db.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host1", type: "EVENT_EDIT_DECLINED" }),
    );
  });

  it("refuses to answer a proposal twice", async () => {
    db.proposalFind.mockResolvedValue(proposal({ status: "declined" }));

    await expect(
      EventEditSvc.decline("citizen1", "p1", NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("lets only the proposing host withdraw", async () => {
    db.proposalFind.mockResolvedValue({ id: "p1", proposedById: "host1" });

    await expect(EventEditSvc.withdraw("stranger", "p1")).rejects.toMatchObject(
      { status: 404 },
    );
    expect(await EventEditSvc.withdraw("host1", "p1")).toEqual({
      proposalId: "p1",
      status: "withdrawn",
    });
  });

  it("refuses to withdraw one already answered", async () => {
    db.proposalFind.mockResolvedValue({ id: "p1", proposedById: "host1" });
    db.proposalUpdateMany.mockResolvedValue({ count: 0 });

    await expect(EventEditSvc.withdraw("host1", "p1")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("EventEditSvc.forBooking", () => {
  it("is not found for anyone but the booking's citizen and host", async () => {
    db.bookingFind.mockResolvedValue({
      userId: "citizen1",
      event: { organizerId: "host1" },
    });

    await expect(
      EventEditSvc.forBooking("stranger", "b1", NOW),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("expires overdue proposals before listing them", async () => {
    db.bookingFind.mockResolvedValue({
      userId: "citizen1",
      event: { organizerId: "host1" },
    });
    db.proposalFindMany
      .mockResolvedValueOnce([{ id: "p0", deltaPaymentIntentId: "pi_old" }])
      .mockResolvedValueOnce([]);

    await EventEditSvc.forBooking("host1", "b1", NOW);

    expect(db.proposalFindMany.mock.calls[0][0].where).toEqual({
      bookingId: "b1",
      status: "pending",
      expiresAt: { lt: NOW },
    });
    expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: "p0", status: "pending" },
      data: { status: "expired" },
    });
    // A difference still being paid for it can no longer go through.
    expect(db.intentCancel).toHaveBeenCalledWith("pi_old");
  });
});

describe("a paid booking (ADR 0010 slice 3)", () => {
  /** Old line 1000, new 1200: the total goes up by 200. */
  const paidProposal = (over: Record<string, unknown> = {}) =>
    proposal({
      booking: { userId: "citizen1", status: "confirmed" },
      currentPrice: D(1000),
      proposedPrice: D(1200),
      priceDelta: D(200),
      deltaPaymentIntentId: null,
      ...over,
    });

  it("lets the host propose a replacement on it", async () => {
    db.bookingFind.mockResolvedValue({
      id: "b1",
      userId: "citizen1",
      status: "confirmed",
    });

    await expect(
      EventEditSvc.propose(
        "host1",
        { kind: "asset", transactionId: "old", itemId: "asset-new" },
        NOW,
      ),
    ).resolves.toMatchObject({ id: "p1" });
  });

  it("asks for the difference before a higher price applies", async () => {
    db.proposalFind.mockResolvedValue(paidProposal());

    const out = await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(db.intentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 20000,
        currency: "php",
        metadata: { eventEditProposalId: "p1" },
      }),
    );
    expect(db.proposalUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { deltaPaymentIntentId: "pi_delta" },
    });
    expect(out).toMatchObject({
      paymentRequired: true,
      clientSecret: "cs_d",
      paid: false,
    });
    expect(db.assetTxCreate).not.toHaveBeenCalled();
    expect(db.bookingUpdate).not.toHaveBeenCalled();
  });

  it("resumes the same payment when the citizen accepts again", async () => {
    db.proposalFind.mockResolvedValue(
      paidProposal({ deltaPaymentIntentId: "pi_delta" }),
    );
    db.intentRetrieve.mockResolvedValue({
      id: "pi_delta",
      status: "requires_payment_method",
      client_secret: "cs_d",
    });

    const out = await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(db.intentCreate).not.toHaveBeenCalled();
    expect(out).toMatchObject({ paymentRequired: true, clientSecret: "cs_d" });
  });

  describe("confirming the payment", () => {
    beforeEach(() => {
      db.proposalFind.mockResolvedValue(
        paidProposal({ deltaPaymentIntentId: "pi_delta" }),
      );
      db.intentRetrieve.mockResolvedValue({
        id: "pi_delta",
        status: "succeeded",
        amount: 20000,
      });
    });

    it("applies the swap, moves the totals and records the payment", async () => {
      const out = await EventEditSvc.confirmPayment("citizen1", "p1", NOW);

      expect(out).toEqual({ proposalId: "p1", transactionId: "new" });
      expect(db.proposalUpdateMany.mock.calls[0][0]).toEqual({
        where: { id: "p1", status: { in: ["pending", "expired"] } },
        data: { status: "accepted", respondedAt: NOW },
      });
      expect(db.bookingUpdate).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { totalAmount: { increment: D(200) } },
      });
      expect(db.eventUpdate).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { totalAmount: { increment: D(200) } },
      });
      expect(db.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: "b1",
          amount: 200,
          transactionId: "pi_delta",
        }),
      );
    });

    it("waits while the payment hasn't gone through", async () => {
      db.intentRetrieve.mockResolvedValue({
        id: "pi_delta",
        status: "processing",
        amount: 20000,
      });

      await expect(
        EventEditSvc.confirmPayment("citizen1", "p1", NOW),
      ).rejects.toMatchObject({ status: 409, code: "PAYMENT_NOT_COMPLETE" });
      expect(db.assetTxCreate).not.toHaveBeenCalled();
      expect(db.stripeRefund).not.toHaveBeenCalled();
    });

    it("refunds the payment when the listing was taken meanwhile", async () => {
      db.reserve.mockRejectedValue(new AvailabilityConflictError([]));

      await expect(
        EventEditSvc.confirmPayment("citizen1", "p1", NOW),
      ).rejects.toMatchObject({ status: 409, code: "AVAILABILITY_CONFLICT" });
      expect(db.stripeRefund).toHaveBeenCalledWith({
        payment_intent: "pi_delta",
      });
      expect(db.refundCreate).toHaveBeenCalled();
      expect(db.createPayment).not.toHaveBeenCalled();
    });

    it("refunds the payment when the host withdrew it meanwhile", async () => {
      db.proposalFind.mockResolvedValue(
        paidProposal({ deltaPaymentIntentId: "pi_delta", status: "withdrawn" }),
      );

      await expect(
        EventEditSvc.confirmPayment("citizen1", "p1", NOW),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.stripeRefund).toHaveBeenCalled();
      expect(db.assetTxCreate).not.toHaveBeenCalled();
    });

    it("applies a payment made just before the proposal lapsed", async () => {
      db.proposalFind.mockResolvedValue(
        paidProposal({ deltaPaymentIntentId: "pi_delta", status: "expired" }),
      );

      await expect(
        EventEditSvc.confirmPayment("citizen1", "p1", NOW),
      ).resolves.toEqual({ proposalId: "p1", transactionId: "new" });
    });

    it("answers the same again once applied", async () => {
      db.proposalFind.mockResolvedValue(
        paidProposal({
          deltaPaymentIntentId: "pi_delta",
          status: "accepted",
          appliedTransactionId: "new",
        }),
      );

      await expect(
        EventEditSvc.confirmPayment("citizen1", "p1", NOW),
      ).resolves.toEqual({ proposalId: "p1", transactionId: "new" });
      expect(db.createPayment).not.toHaveBeenCalled();
    });

    it("refuses a payment that doesn't match the change", async () => {
      db.intentRetrieve.mockResolvedValue({
        id: "pi_delta",
        status: "succeeded",
        amount: 100,
      });

      await expect(
        EventEditSvc.confirmPayment("citizen1", "p1", NOW),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.assetTxCreate).not.toHaveBeenCalled();
    });
  });

  it("applies a lower price at once and refunds the difference", async () => {
    // Old line 1000, new 700: 300 back.
    db.assetFindMany.mockResolvedValue([{ ...candidate, price: D(700) }]);
    db.proposalFind.mockResolvedValue(
      paidProposal({ proposedPrice: D(700), priceDelta: D(-300) }),
    );
    db.payments.mockResolvedValue([
      {
        id: "pay1",
        status: "paid",
        amount: D(5000),
        providerReference: "pi_booking",
        paidAt: new Date("2026-11-10T00:00:00Z"),
      },
    ]);
    db.refundFindMany.mockResolvedValue([
      { paymentId: "pay1", amount: D(4800) },
    ]);

    await EventEditSvc.accept("citizen1", "p1", NOW);

    expect(db.assetTxCreate).toHaveBeenCalled();
    expect(db.bookingUpdate).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { totalAmount: { increment: D(-300) } },
    });
    // Only 200 was left on the payment after an earlier refund.
    expect(db.stripeRefund).toHaveBeenCalledWith({
      payment_intent: "pi_booking",
      amount: 20000,
    });
    expect(db.refundCreate.mock.calls[0][0].data).toMatchObject({
      paymentId: "pay1",
      bookingId: "b1",
      reason: "Event change — price decreased",
    });
    expect(db.intentCreate).not.toHaveBeenCalled();
  });

  it("cancels the payment begun for a proposal the host withdraws", async () => {
    db.proposalFind.mockResolvedValue({
      id: "p1",
      proposedById: "host1",
      deltaPaymentIntentId: "pi_delta",
    });

    await EventEditSvc.withdraw("host1", "p1");

    expect(db.intentCancel).toHaveBeenCalledWith("pi_delta");
  });

  it("tells the citizen a proposal is waiting for its difference, without the payment id", async () => {
    db.bookingFind.mockResolvedValue({
      userId: "citizen1",
      event: { organizerId: "host1" },
    });
    db.proposalFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "p1",
        kind: "asset",
        itemId: "asset-new",
        replacesTransactionId: "old",
        status: "pending",
        deltaPaymentIntentId: "pi_delta",
        deltaRefundId: null,
      },
    ]);
    db.assetTxFind.mockResolvedValue({ assetId: "asset-old" });
    db.assetFindOne.mockResolvedValue({ name: "x" });

    const [row] = await EventEditSvc.forBooking("citizen1", "b1", NOW);

    expect(row.awaitingPayment).toBe(true);
    expect(row).not.toHaveProperty("deltaPaymentIntentId");
  });
});
