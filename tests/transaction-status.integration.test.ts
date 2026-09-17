import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import TransactionStatusSvc from "../src/modules/transaction-status/transaction-status.service";
import {
  InvalidTransitionError,
  TransactionActorUnauthorizedError,
  DeadlinePassedError,
} from "../src/modules/transaction-status/transaction-status.types";

describe("TransactionStatusSvc — centralized transitions, authorization, deadlines", () => {
  const runId = Math.random().toString(36).substring(7);
  let providerId: string;
  let otherProviderId: string;
  let customerId: string;
  let otherUserId: string;
  let assetId: string;
  let eventId: string;
  let bookingId: string;

  const userIds: string[] = [];
  const eatIds: string[] = [];
  const perTestAssetIds: string[] = [];

  const future = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const past = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

  beforeAll(async () => {
    const provider = await prisma.user.create({
      data: { email: `ts_provider_${runId}@test.com`, password: "pw", name: "Provider", roleType: ["gearFoxer"] },
    });
    const otherProvider = await prisma.user.create({
      data: { email: `ts_other_provider_${runId}@test.com`, password: "pw", name: "OtherProvider", roleType: ["gearFoxer"] },
    });
    const customer = await prisma.user.create({
      data: { email: `ts_customer_${runId}@test.com`, password: "pw", name: "Customer", roleType: ["eventFoxer"] },
    });
    const otherUser = await prisma.user.create({
      data: { email: `ts_other_${runId}@test.com`, password: "pw", name: "OtherUser", roleType: ["eventFoxer"] },
    });
    providerId = provider.id;
    otherProviderId = otherProvider.id;
    customerId = customer.id;
    otherUserId = otherUser.id;
    userIds.push(providerId, otherProviderId, customerId, otherUserId);

    const asset = await prisma.asset.create({
      data: {
        ownerId: providerId,
        category: "equipment",
        name: "TS Test Asset",
        description: "desc",
        quantity: 5,
        price: 500,
        billingRate: "daily",
        status: "available",
      },
    });
    assetId = asset.id;

    const event = await prisma.event.create({
      data: {
        clientId: customerId,
        organizerId: customerId,
        name: "TS Test Event",
        description: "desc",
        eventCategory: "corporate",
        startAt: new Date("2027-07-01T00:00:00.000Z"),
        endAt: new Date("2027-07-02T00:00:00.000Z"),
        guestCount: 10,
        totalAmount: 500,
      },
    });
    eventId = event.id;

    const booking = await prisma.booking.create({
      data: {
        eventId,
        userId: customerId,
        guestCount: 10,
        totalAmount: 500,
        status: "pending",
        startAt: event.startAt,
        endAt: event.endAt,
      },
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    await prisma.eventAssetTransaction.deleteMany({ where: { id: { in: eatIds } } });
    await prisma.booking.delete({ where: { id: bookingId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.asset.deleteMany({ where: { id: { in: [assetId, ...perTestAssetIds] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  // A fresh Asset per call, not the shared `assetId` — the new partial
  // unique index on (bookingId, assetId) correctly blocks a second ACTIVE
  // row for the same pair (this was discovered by this very test suite
  // failing against the real index on the first run, not assumed), so each
  // independent test case needs its own item to stay isolated.
  async function makeAdHocRow(overrides: Partial<{ confirmationDeadline: Date | null; status: any }> = {}) {
    const asset = await prisma.asset.create({
      data: {
        ownerId: providerId,
        category: "equipment",
        name: `TS Test Asset ${Math.random().toString(36).substring(7)}`,
        description: "desc",
        quantity: 5,
        price: 500,
        billingRate: "daily",
        status: "available",
      },
    });
    perTestAssetIds.push(asset.id);

    const row = await prisma.eventAssetTransaction.create({
      data: {
        eventId,
        bookingId,
        assetId: asset.id,
        providerId,
        quantity: 1,
        status: overrides.status ?? "pending_provider_confirmation",
        agreedPrice: 500,
        confirmationDeadline: overrides.confirmationDeadline === undefined ? future : overrides.confirmationDeadline,
      },
    });
    eatIds.push(row.id);
    return row;
  }

  it("lets the provider confirm within the deadline", async () => {
    const row = await makeAdHocRow();
    const result = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
    );
    expect((result as any).status).toBe("approved");
  });

  it("rejects confirm from someone who is not the item's provider", async () => {
    const row = await makeAdHocRow();
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: otherProviderId }),
      ),
    ).rejects.toThrow(TransactionActorUnauthorizedError);
  });

  it("rejects confirm past the deadline", async () => {
    const row = await makeAdHocRow({ confirmationDeadline: past });
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
      ),
    ).rejects.toThrow(DeadlinePassedError);
  });

  it("rejects a duplicate confirm on an already-approved row", async () => {
    const row = await makeAdHocRow();
    await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
    );
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
      ),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects confirm on an already-rejected row", async () => {
    const row = await makeAdHocRow();
    await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "reject", actorId: providerId }),
    );
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
      ),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("PROVES a pre-attached item (status pending, never pending_provider_confirmation) cannot enter the confirmation flow", async () => {
    const row = await makeAdHocRow({ status: "pending", confirmationDeadline: null });
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
      ),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("lets the booking owner cancel a pending_provider_confirmation item", async () => {
    const row = await makeAdHocRow();
    const result = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "cancel", actorId: customerId }),
    );
    expect((result as any).status).toBe("cancelled");
  });

  it("lets the booking owner cancel an approved item", async () => {
    const row = await makeAdHocRow();
    await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "confirm", actorId: providerId }),
    );
    const result = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "cancel", actorId: customerId }),
    );
    expect((result as any).status).toBe("cancelled");
  });

  it("rejects cancel from someone who is not the booking owner", async () => {
    const row = await makeAdHocRow();
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "cancel", actorId: otherUserId }),
      ),
    ).rejects.toThrow(TransactionActorUnauthorizedError);
  });

  it("expires a row past its deadline (system action, no actor)", async () => {
    const row = await makeAdHocRow({ confirmationDeadline: past });
    const result = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "expire" }),
    );
    expect((result as any).status).toBe("rejected");
    expect((result as any).rejectionReason).toBe("deadline_expired");
  });

  it("refuses to expire a row whose deadline has not actually passed yet (sweep-vs-confirm race safety)", async () => {
    const row = await makeAdHocRow({ confirmationDeadline: future });
    await expect(
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "expire" }),
      ),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("records a distinct rejectionReason for provider-declined vs deadline-expired", async () => {
    const row = await makeAdHocRow();
    const result = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "reject", actorId: providerId }),
    );
    expect((result as any).rejectionReason).toBe("provider_declined");
  });

  describe("transaction-kind confusion", () => {
    it("returns not-found rather than acting on the row when kind does not match the id's real table", async () => {
      const row = await makeAdHocRow();
      // This id only exists in event_asset_transactions; asking for kind "service" must not succeed.
      await expect(
        prisma.$transaction((tx) =>
          TransactionStatusSvc.transition(tx, { id: row.id, kind: "service", action: "confirm", actorId: providerId }),
        ),
      ).rejects.toThrow();
    });
  });
});
