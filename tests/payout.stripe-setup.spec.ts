import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import { PayoutSourceType } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import { only } from "./helpers/cleanup";
import { signTestSession } from "./helpers/test-session";

/**
 * api#363 against a real database, with Stripe mocked:
 *
 * - a transfer is funded from the client's charge (`source_transaction`),
 *   tagged with its payout and an idempotency key per attempt;
 * - a failed payout records why, and is retried when the recipient finishes
 *   onboarding (`account.updated`) or by an admin;
 * - a retry never pays twice, even after a transfer whose result wasn't saved;
 * - a cancelled/refunded line is never paid by a retry;
 * - chargebacks (`charge.dispute.*`) are recorded once per dispute.
 *
 * Deletes only what it creates.
 */

const stripeMock = vi.hoisted(() => ({
  event: null as null | { id: string; type: string; data: { object: unknown } },
  transfersCreate: vi.fn(),
  transfersList: vi.fn(),
  transfersCreateReversal: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    transfers = {
      create: stripeMock.transfersCreate,
      list: stripeMock.transfersList,
      createReversal: stripeMock.transfersCreateReversal,
    };
    paymentIntents = {
      retrieve: stripeMock.paymentIntentsRetrieve,
      cancel: vi.fn(),
    };
    webhooks = { constructEvent: vi.fn(() => stripeMock.event) };
  },
}));

const app = (await import("../src/app")).default;
const PayoutSvc = (await import("../src/modules/payout/payout.service"))
  .default;

describe("Stripe payout setup (api#363)", () => {
  const runId = Math.random().toString(36).substring(7);
  const userIds: string[] = [];
  const eventIds: string[] = [];
  const disputeIds: string[] = [];
  let paymentId: string | undefined;
  let paidRecipient = "";
  let waitingRecipient = "";
  let zeroRecipient = "";
  let admin = "";
  const acctPaid = `acct_paid_${runId}`;
  const acctWaiting = `acct_wait_${runId}`;

  const adminToken = () =>
    signTestSession({
      userId: admin,
      email: `payout-admin-${runId}@example.com`,
      systemRole: "admin",
    });
  const citizenToken = () =>
    signTestSession({ userId: paidRecipient, systemRole: "user" });

  const newPayout = (providerId: string, amount = 1000) =>
    PayoutSvc.createPayoutRecord({
      providerId,
      sourceType: PayoutSourceType.sponsorship,
      sourceId: `src_${runId}_${Math.random().toString(36).slice(2)}`,
      amount,
    });

  const postWebhook = (event: {
    id: string;
    type: string;
    data: { object: unknown };
  }) => {
    stripeMock.event = event;
    eventIds.push(event.id);
    return request(app)
      .post("/api/v1/payments/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: event.type }));
  };

  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const user = async (key: string, extra: Record<string, unknown> = {}) => {
      const u = await prisma.user.create({
        data: {
          email: `payout-${key}-${runId}@example.com`,
          name: `Payout ${key}`,
          password: "pw",
          ...extra,
        },
      });
      userIds.push(u.id);
      return u.id;
    };
    paidRecipient = await user("paid", {
      paymentAccount: {
        create: { stripeAccountId: acctPaid, stripePayoutsEnabled: true },
      },
    });
    waitingRecipient = await user("waiting", {
      paymentAccount: {
        create: { stripeAccountId: acctWaiting, stripePayoutsEnabled: false },
      },
    });
    zeroRecipient = await user("zero", {
      paymentAccount: {
        create: {
          stripeAccountId: `acct_zero_${runId}`,
          stripePayoutsEnabled: true,
        },
      },
    });
    admin = await user("admin", { systemRole: "admin" });
    const payment = await prisma.payment.create({
      data: {
        amount: 5000,
        method: "card",
        providerReference: `pi_dispute_${runId}`,
        status: "paid",
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    await prisma.paymentDispute.deleteMany({
      where: { stripeDisputeId: only(...disputeIds) },
    });
    await prisma.payment.deleteMany({ where: { id: only(paymentId) } });
    await prisma.paymentProviderEvent.deleteMany({
      where: { providerEventId: only(...eventIds) },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: only(admin) } });
    await prisma.payout.deleteMany({
      where: { providerId: only(...userIds) },
    });
    await prisma.user.deleteMany({ where: { id: only(...userIds) } });
  });

  beforeEach(() => {
    stripeMock.transfersCreate.mockReset();
    stripeMock.transfersList.mockReset();
    stripeMock.paymentIntentsRetrieve.mockReset();
    stripeMock.transfersCreateReversal.mockReset();
    stripeMock.transfersCreateReversal.mockResolvedValue({ id: "trr_1" });
    stripeMock.transfersCreate.mockImplementation(async () => ({
      id: `tr_${Math.random().toString(36).slice(2)}`,
    }));
    stripeMock.transfersList.mockResolvedValue({ data: [] });
  });

  it("funds the transfer from the client's charge, tagged and idempotent", async () => {
    stripeMock.paymentIntentsRetrieve.mockResolvedValue({
      latest_charge: "ch_client_1",
    });
    const payout = await newPayout(paidRecipient, 1234.5);

    await PayoutSvc.fireTransfer(payout.id, {
      paymentReference: "pi_client_1",
    });

    expect(stripeMock.paymentIntentsRetrieve).toHaveBeenCalledWith(
      "pi_client_1",
    );
    expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(1);
    expect(stripeMock.transfersCreate).toHaveBeenCalledWith(
      {
        amount: 123450,
        currency: "php",
        destination: acctPaid,
        transfer_group: payout.sourceId,
        metadata: { payoutId: payout.id },
        source_transaction: "ch_client_1",
      },
      { idempotencyKey: `payout:${payout.id}:1` },
    );
    const after = await prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(after).toMatchObject({
      status: "paid",
      sourceChargeId: "ch_client_1",
      transferAttempts: 1,
      failureReason: null,
    });
    expect(after.providerReference).toMatch(/^tr_/);
  });

  it("uses a charge id as is, and ignores a reference that isn't Stripe's", async () => {
    expect(await PayoutSvc.resolveChargeId("ch_abc")).toBe("ch_abc");
    expect(await PayoutSvc.resolveChargeId("py_abc")).toBe("py_abc");
    expect(await PayoutSvc.resolveChargeId("cs_session")).toBeNull();
    expect(await PayoutSvc.resolveChargeId(null)).toBeNull();
    stripeMock.paymentIntentsRetrieve.mockRejectedValue(new Error("No such"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await PayoutSvc.resolveChargeId("pi_missing")).toBeNull();
    error.mockRestore();
    expect(stripeMock.paymentIntentsRetrieve).toHaveBeenCalledTimes(1);
  });

  it("falls back to the platform balance when the charge can't fund it", async () => {
    stripeMock.paymentIntentsRetrieve.mockResolvedValue({
      latest_charge: "ch_spent",
    });
    stripeMock.transfersCreate
      .mockRejectedValueOnce(
        Object.assign(new Error("Insufficient funds in source"), {
          param: "source_transaction",
        }),
      )
      .mockResolvedValueOnce({ id: "tr_from_balance" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payout = await newPayout(paidRecipient);

    await PayoutSvc.fireTransfer(payout.id, { paymentReference: "pi_spent" });
    warn.mockRestore();

    expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(2);
    const [params, opts] = stripeMock.transfersCreate.mock.calls[1];
    expect(params).not.toHaveProperty("source_transaction");
    expect(opts).toEqual({ idempotencyKey: `payout:${payout.id}:1:balance` });
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({ status: "paid", providerReference: "tr_from_balance" });
  });

  it("records 'not onboarded' without calling Stripe", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const payout = await newPayout(waitingRecipient);
    await PayoutSvc.fireTransfer(payout.id);
    error.mockRestore();

    expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({
      status: "failed",
      failureReason: "not_onboarded",
      transferAttempts: 0,
    });
  });

  it("records a Stripe error with its message", async () => {
    stripeMock.transfersCreate.mockRejectedValue(
      new Error("Your account has insufficient funds"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const payout = await newPayout(paidRecipient);
    await PayoutSvc.fireTransfer(payout.id);
    error.mockRestore();

    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({
      status: "failed",
      failureReason: "stripe_error",
      failureMessage: "Your account has insufficient funds",
      transferAttempts: 1,
    });
  });

  it("never pays twice when a sent transfer couldn't be recorded", async () => {
    const payout = await newPayout(paidRecipient);
    stripeMock.transfersCreate.mockResolvedValueOnce({ id: "tr_sent_once" });
    // The transfer goes through, then saving "paid" fails.
    const update = vi
      .spyOn(prisma.payout, "update")
      .mockRejectedValueOnce(new Error("connection lost"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await PayoutSvc.fireTransfer(payout.id);
    update.mockRestore();
    error.mockRestore();

    // Not marked failed: the money moved.
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({ status: "pending", transferAttempts: 1 });

    // The next attempt finds the transfer instead of sending another.
    stripeMock.transfersList.mockResolvedValue({
      data: [{ id: "tr_sent_once", metadata: { payoutId: payout.id } }],
    });
    await PayoutSvc.fireTransfer(payout.id);

    expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(1);
    expect(stripeMock.transfersList).toHaveBeenCalledWith({
      destination: acctPaid,
      transfer_group: payout.sourceId,
      limit: 100,
    });
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({ status: "paid", providerReference: "tr_sent_once" });
  });

  it("account.updated syncs the flags and pays what waited on onboarding, once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const waiting = await newPayout(waitingRecipient, 700);
    await PayoutSvc.fireTransfer(waiting.id);
    // A line cancelled meanwhile must stay unpaid.
    const cancelled = await newPayout(waitingRecipient, 300);
    await PayoutSvc.fireTransfer(cancelled.id);
    await PayoutSvc.reversePayoutForSource(cancelled.sourceId, 300);
    error.mockRestore();

    const event = {
      id: `evt_acct_${runId}`,
      type: "account.updated",
      data: {
        object: {
          id: acctWaiting,
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    };
    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(
      await prisma.paymentAccount.findUniqueOrThrow({
        where: { userId: waitingRecipient },
      }),
    ).toMatchObject({
      stripePayoutsEnabled: true,
      stripeOnboardingComplete: true,
    });
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: waiting.id } }),
    ).toMatchObject({ status: "paid", failureReason: null });
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: cancelled.id } }),
    ).toMatchObject({ status: "failed", failureReason: "source_refunded" });
    // Every payout of theirs that waited on onboarding is paid (the earlier
    // "not onboarded" test left one too), and the cancelled one never is.
    const sentFor = () =>
      stripeMock.transfersCreate.mock.calls.map(
        ([params]) =>
          (params as { metadata: { payoutId: string } }).metadata.payoutId,
      );
    expect(sentFor()).toContain(waiting.id);
    expect(sentFor()).not.toContain(cancelled.id);
    const sent = stripeMock.transfersCreate.mock.calls.length;

    // Stripe redelivers the same event: nothing is sent again.
    await postWebhook(event);
    expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(sent);
  });

  it("admins list failed payouts and retry one; the rest are refused", async () => {
    stripeMock.transfersCreate.mockRejectedValueOnce(new Error("Stripe down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const payout = await newPayout(paidRecipient, 450);
    await PayoutSvc.fireTransfer(payout.id);
    error.mockRestore();

    const list = await request(app)
      .get("/api/v1/admin/payouts?status=failed&failureReason=stripe_error")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(
      payout.id,
    );

    const forbidden = await request(app)
      .post(`/api/v1/admin/payouts/${payout.id}/retry`)
      .set("Authorization", `Bearer ${citizenToken()}`);
    expect(forbidden.status).toBe(403);

    const retry = await request(app)
      .post(`/api/v1/admin/payouts/${payout.id}/retry`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({
      status: "paid",
      transferAttempts: 2,
    });
    // Attempt 2 checked Stripe for a transfer from attempt 1 first.
    expect(stripeMock.transfersList).toHaveBeenCalledTimes(1);
    expect(stripeMock.transfersCreate.mock.calls[1][1]).toEqual({
      idempotencyKey: `payout:${payout.id}:2`,
    });

    const again = await request(app)
      .post(`/api/v1/admin/payouts/${payout.id}/retry`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("PAYOUT_ALREADY_PAID");

    const audit = await prisma.auditLog.findMany({
      where: { actorId: admin, action: "payout.retry" },
    });
    expect(audit.map((a) => a.outcome).sort()).toEqual(["allowed", "refused"]);
  });

  it("refuses to retry a payout whose line was refunded", async () => {
    const payout = await newPayout(paidRecipient);
    await PayoutSvc.reversePayoutForSource(payout.sourceId, 1000);
    await expect(
      PayoutSvc.retryPayout(payout.id, {
        userId: admin,
        email: "admin@example.com",
      }),
    ).rejects.toMatchObject({ status: 409, code: "PAYOUT_SOURCE_REFUNDED" });
    expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
  });

  // api#395: Stripe refuses a ₱0 transfer.
  it("never sends a ₱0 payout, and admins can't retry one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const zero = await newPayout(zeroRecipient, 0);
    await PayoutSvc.fireTransfer(zero.id);
    warn.mockRestore();
    expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: zero.id } }),
    ).toMatchObject({ status: "pending", transferAttempts: 0 });

    // A ₱0 row from before the fix, waiting on onboarding: the onboarding
    // retry skips it, and an admin retry is refused.
    await prisma.payout.update({
      where: { id: zero.id },
      data: { status: "failed", failureReason: "not_onboarded" },
    });
    expect(await PayoutSvc.retryNotOnboardedForUser(zeroRecipient)).toBe(0);
    await expect(
      PayoutSvc.retryPayout(zero.id, {
        userId: admin,
        email: "admin@example.com",
      }),
    ).rejects.toMatchObject({ status: 409, code: "PAYOUT_ZERO_AMOUNT" });
    expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: zero.id } }),
    ).toMatchObject({ status: "failed", failureReason: "not_onboarded" });
  });

  // api#395: a cancellation landing while the transfer is in flight.
  it("reverses a transfer that went out after its line was cancelled", async () => {
    const payout = await newPayout(paidRecipient, 500);
    stripeMock.transfersCreate.mockImplementationOnce(async () => {
      // The cancellation lands while Stripe is still answering.
      await PayoutSvc.reversePayoutForSource(payout.sourceId, 500);
      return { id: "tr_late" };
    });

    await PayoutSvc.fireTransfer(payout.id);

    expect(stripeMock.transfersCreateReversal).toHaveBeenCalledTimes(1);
    expect(stripeMock.transfersCreateReversal).toHaveBeenCalledWith(
      "tr_late",
      {},
      { idempotencyKey: `payout:${payout.id}:reversal:tr_late` },
    );
    const after = await prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(after).toMatchObject({
      status: "failed",
      failureReason: "source_refunded",
      providerReference: "tr_late",
    });
    expect(after.failureMessage).toMatch(/transfer was reversed/);
    expect(after.paidAt).toBeNull();
    await expect(
      PayoutSvc.retryPayout(payout.id, {
        userId: admin,
        email: "admin@example.com",
      }),
    ).rejects.toMatchObject({ code: "PAYOUT_SOURCE_REFUNDED" });
  });

  it("notes a reversal that failed, for manual reconciliation", async () => {
    const payout = await newPayout(paidRecipient, 600);
    stripeMock.transfersCreate.mockImplementationOnce(async () => {
      await PayoutSvc.reversePayoutForSource(payout.sourceId, 600);
      return { id: "tr_late_2" };
    });
    stripeMock.transfersCreateReversal.mockRejectedValueOnce(
      new Error("Stripe down"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await PayoutSvc.fireTransfer(payout.id);
    error.mockRestore();

    const after = await prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(after).toMatchObject({
      status: "failed",
      failureReason: "source_refunded",
      providerReference: "tr_late_2",
    });
    expect(after.failureMessage).toMatch(/reconcile it in Stripe/);
  });

  it("reverses a transfer an earlier attempt sent but couldn't record", async () => {
    const payout = await newPayout(paidRecipient, 700);
    stripeMock.transfersCreate.mockResolvedValueOnce({ id: "tr_unrecorded" });
    const update = vi
      .spyOn(prisma.payout, "update")
      .mockRejectedValueOnce(new Error("connection lost"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await PayoutSvc.fireTransfer(payout.id);
    update.mockRestore();
    error.mockRestore();
    // Sent, not recorded: still pending.
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({ status: "pending", transferAttempts: 1 });

    stripeMock.transfersList.mockResolvedValue({
      data: [{ id: "tr_unrecorded", metadata: { payoutId: payout.id } }],
    });
    await PayoutSvc.reversePayoutForSource(payout.sourceId, 700);

    expect(stripeMock.transfersList).toHaveBeenCalledWith({
      destination: acctPaid,
      transfer_group: payout.sourceId,
      limit: 100,
    });
    expect(stripeMock.transfersCreateReversal).toHaveBeenCalledWith(
      "tr_unrecorded",
      {},
      { idempotencyKey: `payout:${payout.id}:reversal:tr_unrecorded` },
    );
    expect(
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
    ).toMatchObject({
      status: "failed",
      failureReason: "source_refunded",
      providerReference: "tr_unrecorded",
    });
  });

  it("records a chargeback once per dispute and lists it for admins", async () => {
    const disputeId = `dp_${runId}`;
    disputeIds.push(disputeId);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispute = (status: string) => ({
      id: disputeId,
      charge: "ch_disputed",
      payment_intent: `pi_dispute_${runId}`,
      amount: 123450,
      currency: "php",
      reason: "fraudulent",
      status,
      evidence_details: { due_by: 1_800_000_000 },
    });

    const created = {
      id: `evt_dp_created_${runId}`,
      type: "charge.dispute.created",
      data: { object: dispute("needs_response") },
    };
    expect((await postWebhook(created)).status).toBe(200);
    await postWebhook(created); // redelivered
    await postWebhook({
      id: `evt_dp_closed_${runId}`,
      type: "charge.dispute.closed",
      data: { object: dispute("lost") },
    });
    warn.mockRestore();

    const rows = await prisma.paymentDispute.findMany({
      where: { stripeDisputeId: disputeId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stripeChargeId: "ch_disputed",
      paymentId,
      currency: "php",
      reason: "fraudulent",
      status: "lost",
    });
    expect(rows[0].amount.toString()).toBe("1234.5");
    expect(rows[0].evidenceDueBy?.getTime()).toBe(1_800_000_000_000);

    const list = await request(app)
      .get("/api/v1/admin/payment-disputes?status=lost")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(list.status).toBe(200);
    expect(
      list.body.data.find(
        (d: { stripeDisputeId: string }) => d.stripeDisputeId === disputeId,
      ),
    ).toMatchObject({ payment: { id: paymentId } });
  });
});

/**
 * api#395: which client charge funds each Event line's transfer. A line is
 * funded by the paid invoice that charged it; a line no invoice charged, and
 * the EventFoxer's commission, by the latest one. A ₱0 commission (a markup
 * of 0 and no per-line breakdown) creates no payout at all.
 */
describe("Event booking: per-line charge mapping (api#395)", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  const userIds: string[] = [];
  const serviceIds: string[] = [];
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    const user = async (key: string, payable = false) => {
      const u = await prisma.user.create({
        data: {
          email: `lines-${key}-${runId}@example.com`,
          name: `Lines ${key}`,
          password: "pw",
          ...(payable
            ? {
                paymentAccount: {
                  create: {
                    stripeAccountId: `acct_lines_${key}_${runId}`,
                    stripePayoutsEnabled: true,
                  },
                },
              }
            : {}),
        },
      });
      userIds.push(u.id);
      return u.id;
    };
    ids.client = await user("client");
    ids.organizer = await user("organizer", true);
    for (const key of ["a", "b", "c"]) ids[key] = await user(key, true);

    const start = new Date(Date.now() + 30 * 86_400_000);
    const end = new Date(start.getTime() + 4 * 3_600_000);
    ids.event = (
      await prisma.event.create({
        data: {
          clientId: ids.client,
          organizerId: ids.organizer,
          name: `Lines event ${runId}`,
          description: "desc",
          eventCategory: "corporate",
          startAt: start,
          endAt: end,
          guestCount: 10,
          totalAmount: 3000,
        },
      })
    ).id;
    ids.booking = (
      await prisma.booking.create({
        data: {
          eventId: ids.event,
          userId: ids.client,
          guestCount: 10,
          totalAmount: 3000,
          status: "completed",
          startAt: start,
          endAt: end,
        },
      })
    ).id;
    const line = async (key: string, price: number) => {
      const service = await prisma.service.create({
        data: {
          ownerId: ids[key],
          category: "catering",
          name: `Lines ${key} ${runId}`,
          description: "desc",
          price,
          billingRate: "hourly",
        },
      });
      serviceIds.push(service.id);
      return (
        await prisma.eventServiceTransaction.create({
          data: {
            eventId: ids.event,
            bookingId: ids.booking,
            serviceId: service.id,
            providerId: ids[key],
            agreedPrice: price,
            status: "approved",
          },
        })
      ).id;
    };
    ids.txA = await line("a", 1000);
    ids.txB = await line("b", 1200);
    ids.txC = await line("c", 800); // charged by no invoice

    // Two paid invoices, the older charging line A, the newer line B.
    const invoice = async (txId: string, charge: string, ageMs: number) => {
      const createdAt = new Date(Date.now() - ageMs);
      const inv = await prisma.invoice.create({
        data: {
          payerId: ids.client,
          subtotalAmount: 1000,
          grossAmount: 1000,
          status: "paid",
          createdAt,
          items: {
            create: [
              {
                amount: 1000,
                description: "line",
                sourceType: "event_service_transaction",
                sourceId: txId,
              },
            ],
          },
          payments: {
            create: [
              {
                amount: 1000,
                method: "card",
                providerReference: charge,
                status: "paid",
                createdAt,
              },
            ],
          },
        },
      });
      invoiceIds.push(inv.id);
    };
    ids.chargeA = `ch_line_a_${runId}`;
    ids.chargeB = `ch_line_b_${runId}`;
    await invoice(ids.txA, ids.chargeA, 2 * 3_600_000);
    await invoice(ids.txB, ids.chargeB, 3_600_000);
  });

  afterAll(async () => {
    await prisma.payout.deleteMany({ where: { providerId: only(...userIds) } });
    await prisma.payment.deleteMany({
      where: { invoiceId: only(...invoiceIds) },
    });
    await prisma.invoiceItem.deleteMany({
      where: { invoiceId: only(...invoiceIds) },
    });
    await prisma.invoice.deleteMany({ where: { id: only(...invoiceIds) } });
    await prisma.eventServiceTransaction.deleteMany({
      where: { eventId: only(ids.event) },
    });
    await prisma.booking.deleteMany({ where: { id: only(ids.booking) } });
    await prisma.event.deleteMany({ where: { id: only(ids.event) } });
    await prisma.service.deleteMany({ where: { id: only(...serviceIds) } });
    await prisma.user.deleteMany({ where: { id: only(...userIds) } });
  });

  beforeEach(() => {
    stripeMock.transfersCreate.mockReset();
    stripeMock.transfersCreate.mockImplementation(async () => ({
      id: `tr_${Math.random().toString(36).slice(2)}`,
    }));
    stripeMock.paymentIntentsRetrieve.mockReset();
  });

  it("funds each line from the charge that paid for it", async () => {
    await PayoutSvc.createPayoutsForEventBooking(ids.booking);

    const rows = await prisma.payout.findMany({
      where: { providerId: only(...userIds) },
    });
    const bySource = new Map(rows.map((r) => [r.sourceId, r]));
    expect(bySource.get(ids.txA)?.sourceChargeId).toBe(ids.chargeA);
    expect(bySource.get(ids.txB)?.sourceChargeId).toBe(ids.chargeB);
    // Charged by no invoice: the latest charge.
    expect(bySource.get(ids.txC)?.sourceChargeId).toBe(ids.chargeB);

    const sentFrom = new Map(
      stripeMock.transfersCreate.mock.calls.map(([params]) => {
        const p = params as {
          metadata: { payoutId: string };
          source_transaction?: string;
        };
        return [p.metadata.payoutId, p.source_transaction];
      }),
    );
    expect(sentFrom.get(bySource.get(ids.txA)!.id)).toBe(ids.chargeA);
    expect(sentFrom.get(bySource.get(ids.txB)!.id)).toBe(ids.chargeB);
    expect(sentFrom.get(bySource.get(ids.txC)!.id)).toBe(ids.chargeB);
    // Charge ids are used as they are; no PaymentIntent lookups.
    expect(stripeMock.paymentIntentsRetrieve).not.toHaveBeenCalled();

    // The commission is ₱0: no EventFoxer payout row, nothing sent to them.
    expect(rows.find((r) => r.sourceType === "event_host_markup")).toBe(
      undefined,
    );
    expect(rows.every((r) => r.status === "paid")).toBe(true);
    expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(3);
  });
});
