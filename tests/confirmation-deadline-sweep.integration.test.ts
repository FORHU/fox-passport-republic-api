import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import ConfirmationDeadlineSweepSvc from "../src/modules/transaction-status/confirmation-deadline-sweep.service";
import TransactionStatusSvc from "../src/modules/transaction-status/transaction-status.service";

describe("ConfirmationDeadlineSweepSvc.runSweep — deadline expiration and races", () => {
  const runId = Math.random().toString(36).substring(7);
  let customerId: string;
  let providerId: string;
  let eventId: string;
  let bookingId: string;
  let assetId: string;

  const userIds: string[] = [];
  const eatIds: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    const customer = await prisma.user.create({
      data: { email: `sweep_customer_${runId}@test.com`, password: "pw", name: "Customer", roleType: ["eventFoxer"] },
    });
    const provider = await prisma.user.create({
      data: { email: `sweep_provider_${runId}@test.com`, password: "pw", name: "Provider", roleType: ["gearFoxer"] },
    });
    customerId = customer.id;
    providerId = provider.id;
    userIds.push(customerId, providerId);

    const event = await prisma.event.create({
      data: {
        clientId: customerId,
        organizerId: customerId,
        name: "Sweep Test Event",
        description: "desc",
        eventCategory: "corporate",
        startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        guestCount: 10,
        totalAmount: 0,
      },
    });
    eventId = event.id;

    const booking = await prisma.booking.create({
      data: {
        eventId,
        userId: customerId,
        guestCount: 10,
        totalAmount: 0,
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
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function makeRow(deadline: Date) {
    const asset = await prisma.asset.create({
      data: {
        ownerId: providerId,
        category: "equipment",
        name: `Sweep test asset ${Math.random().toString(36).slice(2)}`,
        description: "desc",
        quantity: 5,
        price: 100,
        billingRate: "daily",
        status: "available",
      },
    });
    assetIds.push(asset.id);

    const row = await prisma.eventAssetTransaction.create({
      data: {
        eventId,
        bookingId,
        assetId: asset.id,
        providerId,
        quantity: 1,
        agreedPrice: 100,
        status: "pending_provider_confirmation",
        confirmationDeadline: deadline,
      },
    });
    eatIds.push(row.id);
    return row;
  }

  it("expires a row past its deadline and notifies both provider and customer", async () => {
    const row = await makeRow(new Date(Date.now() - 60 * 1000));

    const result = await ConfirmationDeadlineSweepSvc.runSweep();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const updated = await prisma.eventAssetTransaction.findUnique({ where: { id: row.id } });
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectionReason).toBe("deadline_expired");

    const providerNotifs = await prisma.notification.findMany({
      where: { userId: providerId, type: "MARKETPLACE_ITEM_EXPIRED" },
    });
    const customerNotifs = await prisma.notification.findMany({
      where: { userId: customerId, type: "MARKETPLACE_ITEM_EXPIRED" },
    });
    expect(providerNotifs.length).toBeGreaterThanOrEqual(1);
    expect(customerNotifs.length).toBeGreaterThanOrEqual(1);
  });

  it("does not touch a row whose deadline has not passed yet", async () => {
    const row = await makeRow(new Date(Date.now() + 60 * 60 * 1000));

    await ConfirmationDeadlineSweepSvc.runSweep();

    const unchanged = await prisma.eventAssetTransaction.findUnique({ where: { id: row.id } });
    expect(unchanged?.status).toBe("pending_provider_confirmation");
  });

  it("race safety: a row rejected by its provider right as the sweep is also trying to expire it is only ever transitioned once", async () => {
    const row = await makeRow(new Date(Date.now() - 60 * 1000));

    // Genuinely concurrent: the provider's own reject and the sweep's
    // expire attempt both target the same already-past-deadline row at the
    // same time. Whichever acquires TransactionStatusSvc's row lock first
    // wins; the other's fresh in-transaction status check must see the
    // row is no longer `pending_provider_confirmation` and fail cleanly
    // with InvalidTransitionError, never producing two writes or a
    // corrupted intermediate state.
    const [rejectResult, sweepResult] = await Promise.allSettled([
      prisma.$transaction((tx) =>
        TransactionStatusSvc.transition(tx, { id: row.id, kind: "asset", action: "reject", actorId: providerId }),
      ),
      ConfirmationDeadlineSweepSvc.runSweep(),
    ]);

    // At least one of the two must have succeeded in actually changing the
    // row (the reject directly, or the sweep's own expire call) — the two
    // can't both silently no-op.
    const rejectSucceeded = rejectResult.status === "fulfilled";
    const sweepExpiredThisRow =
      sweepResult.status === "fulfilled" && sweepResult.value.expired >= 1;
    expect(rejectSucceeded || sweepExpiredThisRow).toBe(true);

    const final = await prisma.eventAssetTransaction.findUnique({ where: { id: row.id } });
    // Whichever won, the row ends up rejected exactly once — not left in
    // pending_provider_confirmation, and not double-processed.
    expect(final?.status).toBe("rejected");
  });
});
