import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import {
  PayoutFailureReason,
  PayoutSourceType,
  PayoutStatus,
  Prisma,
  TransactionStatus,
} from "@prisma/client";
import { STRIPE_SECRET_KEY } from "../../config";
import { conflict, notFound } from "../../utils/errors";
import { recordAudit, type AuditActor } from "../audit/audit.service";
import { toStripeCents } from "../../utils/pricing";
import {
  eventBreakdownLines,
  type EventChargeLine,
} from "../payment/event-breakdown-snapshot";

/** Line statuses the client isn't paying for, so they earn no commission. */
const UNPAID_LINE_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.rejected,
  TransactionStatus.cancelled,
]);

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

/**
 * Unified payout ledger — see docs/adr/0002-stripe-connect-payouts.md.
 * Every Transfer to a Mayor/Foxer/Host goes through here, regardless of which
 * flow it came from (direct Asset/Service booking, or a multi-provider Event
 * booking). Separate Charges and Transfers: the citizen's payment already
 * landed in the platform's own Stripe balance (PaymentIntent) — this only
 * moves the recipient's share out of that balance afterward.
 *
 * `../payment/payout.service.ts` (`PaymentPayoutSvc`) is a second, equally
 * real entry point for the newer Invoice/Checkout flow — see this ADR's
 * "Addendum: why there are two payout-computing services" for why that one
 * isn't dead duplication. Both end up calling `fireTransfer` below.
 */
export default class PayoutSvc {
  /**
   * A Foxer's own payout ledger — every row they've been the recipient of,
   * newest first, plus paid/pending running totals so a dashboard doesn't
   * need to re-sum the page it's looking at (or re-fetch every row just to
   * show a balance).
   */
  static async getPayoutsForProvider(providerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [payouts, total, paidTotal, pendingTotal] = await Promise.all([
      prisma.payout.findMany({
        where: { providerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.payout.count({ where: { providerId } }),
      prisma.payout.aggregate({
        where: { providerId, status: PayoutStatus.paid },
        _sum: { payoutAmount: true },
      }),
      prisma.payout.aggregate({
        where: { providerId, status: PayoutStatus.pending },
        _sum: { payoutAmount: true },
      }),
    ]);

    return {
      payouts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      totals: {
        paid: paidTotal._sum.payoutAmount?.toNumber() ?? 0,
        pending: pendingTotal._sum.payoutAmount?.toNumber() ?? 0,
      },
    };
  }

  /**
   * Idempotency guard: the @@unique([sourceType, sourceId, providerId])
   * constraint means calling this twice for the same provider/source is a
   * no-op the second time (update: {}), so updateStatus(completed) being
   * called more than once never double-pays anyone. There is no `role` on
   * the current `Payout` model — `sourceType` alone already disambiguates
   * which capacity the provider is being paid in.
   */
  static async createPayoutRecord(data: {
    providerId: string;
    sourceType: PayoutSourceType;
    sourceId: string;
    amount: number;
  }) {
    return prisma.payout.upsert({
      where: {
        sourceType_sourceId_providerId: {
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          providerId: data.providerId,
        },
      },
      create: {
        providerId: data.providerId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        allocationAmount: data.amount,
        payoutAmount: data.amount,
      },
      update: {}, // already exists — no-op, this is the idempotency guard
    });
  }

  /**
   * Fires the actual Stripe Transfer for an existing (pending) Payout row.
   * Never throws: a failure is recorded on the row (`failureReason`,
   * `failureMessage`) or logged, never raised to the caller.
   *
   * `paymentReference` is the client's payment this payout is funded from
   * (a PaymentIntent `pi_…`, or a charge `ch_…`/`py_…`). It is resolved to a
   * charge once and stored as `sourceChargeId`, which the transfer names as
   * its `source_transaction`: the transfer then waits for that charge's funds
   * to settle instead of failing on the platform's available balance (api#363).
   */
  static async fireTransfer(
    payoutId: string,
    opts: { paymentReference?: string | null } = {},
  ): Promise<void> {
    try {
      await this.attemptTransfer(payoutId, opts.paymentReference ?? null);
    } catch (e: unknown) {
      // Only database errors reach here; Stripe errors are recorded on the
      // row. A payout left `pending` this way is listed for admins and its
      // next attempt first checks whether a transfer was already sent.
      console.error(
        `Payout ${payoutId}: transfer attempt aborted: ${(e as Error).message ?? "unknown error"}`,
      );
    }
  }

  private static async attemptTransfer(
    payoutId: string,
    paymentReference: string | null,
  ): Promise<void> {
    let payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { providerUser: { include: { paymentAccount: true } } },
    });
    if (!payout) return;
    if (payout.status !== PayoutStatus.pending) return; // already paid or failed, don't retry blindly
    if (!this.isPayable(payout.payoutAmount)) {
      // Stripe refuses a ₱0 transfer. New ₱0 payouts aren't created
      // (createAndFire); this covers rows created before that, which stay as
      // they are rather than being marked paid with no transfer.
      console.warn(
        `Payout ${payoutId}: amount ${payout.payoutAmount.toString()} is nothing to send`,
      );
      return;
    }

    if (!payout.sourceChargeId && paymentReference) {
      const sourceChargeId = await this.resolveChargeId(paymentReference);
      if (sourceChargeId) {
        payout = await prisma.payout.update({
          where: { id: payoutId },
          data: { sourceChargeId },
          include: { providerUser: { include: { paymentAccount: true } } },
        });
      }
    }

    const recipient = payout.providerUser;
    // [MIGRATION-FLAG: Stage 3 Switch] Read stripeAccountId and stripePayoutsEnabled from paymentAccount with fallback
    const stripeAccountId =
      recipient.paymentAccount?.stripeAccountId || recipient.stripeAccountId;
    const stripePayoutsEnabled =
      recipient.paymentAccount?.stripePayoutsEnabled ??
      recipient.stripePayoutsEnabled;

    if (!stripeAccountId || !stripePayoutsEnabled) {
      // Retried by retryNotOnboardedForUser once their account can be paid.
      await prisma.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.pending },
        data: {
          status: PayoutStatus.failed,
          failureReason: PayoutFailureReason.not_onboarded,
          failureMessage: stripeAccountId
            ? "Stripe account can't receive payouts yet"
            : "No Stripe account",
        },
      });
      console.error(
        `Payout ${payoutId} failed: recipient ${recipient.id} has not completed Stripe Connect onboarding`,
      );
      return;
    }

    // Claim this attempt. Only one caller wins for a given attempt number, so
    // an onboarding retry and an admin retry arriving together can't both send.
    const attempt = payout.transferAttempts + 1;
    const claimed = await prisma.payout.updateMany({
      where: {
        id: payoutId,
        status: PayoutStatus.pending,
        transferAttempts: payout.transferAttempts,
      },
      data: { transferAttempts: attempt },
    });
    if (claimed.count === 0) return; // another attempt is running

    // An earlier attempt may have sent the transfer and then failed to record
    // it. Sending again would pay twice.
    if (attempt > 1) {
      const existing = await this.findSentTransfer(
        payout.id,
        payout.sourceId,
        stripeAccountId,
      );
      if (existing) {
        await this.markPaid(payout.id, existing.id);
        return;
      }
    }

    let transferId: string;
    try {
      transferId = await this.createTransfer(payout, stripeAccountId, attempt);
    } catch (e: unknown) {
      const message = (e as Error).message ?? "unknown error";
      await prisma.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.pending },
        data: {
          status: PayoutStatus.failed,
          failureReason: PayoutFailureReason.stripe_error,
          failureMessage: message.slice(0, 500),
        },
      });
      console.error(`Payout ${payoutId} Stripe transfer failed: ${message}`);
      return;
    }

    // The money has moved. If recording it fails, the payout must not be
    // marked failed: it stays pending, and the next attempt finds this
    // transfer by its metadata instead of sending another.
    await this.markPaid(payout.id, transferId);
  }

  /** One Stripe transfer for this attempt; returns its id. */
  private static async createTransfer(
    payout: {
      id: string;
      sourceId: string;
      payoutAmount: Prisma.Decimal;
      sourceChargeId: string | null;
    },
    destination: string,
    attempt: number,
  ): Promise<string> {
    const params: Stripe.TransferCreateParams = {
      amount: toStripeCents(payout.payoutAmount.toNumber()),
      currency: "php",
      destination,
      transfer_group: payout.sourceId,
      metadata: { payoutId: payout.id },
    };
    const idempotencyKey = `payout:${payout.id}:${attempt}`;

    if (!payout.sourceChargeId) {
      return (await stripe.transfers.create(params, { idempotencyKey })).id;
    }
    try {
      return (
        await stripe.transfers.create(
          { ...params, source_transaction: payout.sourceChargeId },
          { idempotencyKey },
        )
      ).id;
    } catch (e: unknown) {
      // The charge can't fund this transfer (already transferred or refunded
      // past this amount, another currency…). Fall back to the platform
      // balance, which is how every transfer worked before api#363.
      if ((e as { param?: string }).param !== "source_transaction") throw e;
      console.warn(
        `Payout ${payout.id}: charge ${payout.sourceChargeId} can't fund the transfer; using the platform balance`,
      );
      return (
        await stripe.transfers.create(params, {
          idempotencyKey: `${idempotencyKey}:balance`,
        })
      ).id;
    }
  }

  /** A transfer an earlier attempt of this payout already sent, if any. */
  private static async findSentTransfer(
    payoutId: string,
    transferGroup: string,
    destination: string,
  ): Promise<Stripe.Transfer | null> {
    const transfers = await stripe.transfers.list({
      destination,
      transfer_group: transferGroup,
      limit: 100,
    });
    return (
      transfers.data.find((t) => t.metadata?.payoutId === payoutId) ?? null
    );
  }

  /**
   * Records a sent transfer, but only on a payout that is still `pending`.
   * A cancellation can land while the transfer is in flight
   * (`reversePayoutForSource` then marks the row `source_refunded`); writing
   * `paid` over that would pay a cancelled line, so the transfer is reversed
   * instead and the row stays unpayable.
   */
  private static async markPaid(payoutId: string, transferId: string) {
    try {
      await prisma.payout.update({
        where: { id: payoutId, status: PayoutStatus.pending },
        data: {
          status: PayoutStatus.paid,
          providerReference: transferId,
          paidAt: new Date(),
          failureReason: null,
          failureMessage: null,
        },
      });
    } catch (e: unknown) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== "P2025"
      ) {
        throw e;
      }
      const row = await prisma.payout.findUnique({
        where: { id: payoutId },
        select: { status: true },
      });
      if (!row || row.status === PayoutStatus.paid) return;
      await this.reverseSentTransfer(payoutId, transferId);
    }
  }

  /**
   * Pulls back, in full, a transfer that went out for a payout whose line was
   * cancelled or refunded, and keeps its id on the row. Never throws on a
   * Stripe error: a failed reversal is logged and noted on the row for manual
   * reconciliation. One idempotency key per transfer, so the two callers
   * (a late `markPaid`, `reversePayoutForSource`) can't reverse it twice.
   */
  private static async reverseSentTransfer(
    payoutId: string,
    transferId: string,
  ): Promise<void> {
    let reversed = false;
    try {
      await stripe.transfers.createReversal(
        transferId,
        {},
        { idempotencyKey: `payout:${payoutId}:reversal:${transferId}` },
      );
      reversed = true;
    } catch (e: unknown) {
      console.error(
        `Payout ${payoutId}: transfer ${transferId} went out after its line was cancelled, and reversing it failed: ${(e as Error).message ?? "unknown error"}`,
      );
    }
    await prisma.payout.updateMany({
      where: { id: payoutId, status: { not: PayoutStatus.paid } },
      data: {
        providerReference: transferId,
        failureMessage: reversed
          ? "The booking line was cancelled while the transfer was being sent; the transfer was reversed"
          : "The booking line was cancelled while the transfer was being sent; reversing the transfer failed, reconcile it in Stripe",
      },
    });
  }

  /** Whether an amount is at least one centavo, the least Stripe transfers. */
  private static isPayable(amount: Prisma.Decimal | number): boolean {
    const value = amount instanceof Prisma.Decimal ? amount.toNumber() : amount;
    return toStripeCents(value) > 0;
  }

  /**
   * The charge behind a payment reference: a charge id as is, or a
   * PaymentIntent's latest charge. Null when it can't be found; the transfer
   * then draws on the platform balance.
   */
  static async resolveChargeId(
    paymentReference: string | null | undefined,
  ): Promise<string | null> {
    if (!paymentReference) return null;
    if (
      paymentReference.startsWith("ch_") ||
      paymentReference.startsWith("py_")
    ) {
      return paymentReference;
    }
    if (!paymentReference.startsWith("pi_")) return null;
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentReference);
      const charge = intent.latest_charge;
      return typeof charge === "string" ? charge : (charge?.id ?? null);
    } catch (e: unknown) {
      console.error(
        `Couldn't resolve the charge of ${paymentReference}: ${(e as Error).message ?? "unknown error"}`,
      );
      return null;
    }
  }

  /**
   * Retry one payout (admin). A `failed` payout goes back to `pending` and is
   * fired; a `pending` one (an attempt that couldn't record its result) is
   * fired again, which first checks Stripe for a transfer already sent.
   * Refuses a paid payout and one whose source was cancelled or refunded.
   */
  static async retryPayout(payoutId: string, actor: AuditActor) {
    const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw notFound("Payout");
    const audit = (outcome: "allowed" | "refused", why?: string) =>
      recordAudit({
        actorId: actor.userId,
        actorEmail: actor.email,
        action: "payout.retry",
        targetId: payout.providerId,
        outcome,
        metadata: {
          payoutId,
          previousStatus: payout.status,
          previousFailureReason: payout.failureReason,
          amount: payout.payoutAmount.toString(),
          ...(why ? { refusedBecause: why } : {}),
        },
      });
    if (payout.status === PayoutStatus.paid) {
      await audit("refused", "already_paid");
      throw conflict(
        "This payout has already been paid",
        "PAYOUT_ALREADY_PAID",
      );
    }
    if (payout.failureReason === PayoutFailureReason.source_refunded) {
      await audit("refused", "source_refunded");
      throw conflict(
        "This payout's booking line was cancelled or refunded, so it can't be paid",
        "PAYOUT_SOURCE_REFUNDED",
      );
    }
    if (!this.isPayable(payout.payoutAmount)) {
      await audit("refused", "zero_amount");
      throw conflict(
        "This payout is ₱0, so there is nothing to send",
        "PAYOUT_ZERO_AMOUNT",
      );
    }
    await audit("allowed");
    if (payout.status === PayoutStatus.failed) {
      await prisma.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.failed },
        data: {
          status: PayoutStatus.pending,
          failureReason: null,
          failureMessage: null,
        },
      });
    }
    await this.fireTransfer(payoutId);
    return prisma.payout.findUnique({ where: { id: payoutId } });
  }

  /**
   * After a recipient's Connect account can receive payouts
   * (`account.updated`), pay what failed only because it couldn't.
   * Returns how many were retried.
   */
  static async retryNotOnboardedForUser(userId: string): Promise<number> {
    const waiting = await prisma.payout.findMany({
      where: {
        providerId: userId,
        status: PayoutStatus.failed,
        failureReason: PayoutFailureReason.not_onboarded,
        // A ₱0 row from before createAndFire skipped them: nothing to send.
        payoutAmount: { gt: 0 },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    let retried = 0;
    for (const { id } of waiting) {
      const reset = await prisma.payout.updateMany({
        where: {
          id,
          status: PayoutStatus.failed,
          failureReason: PayoutFailureReason.not_onboarded,
        },
        data: {
          status: PayoutStatus.pending,
          failureReason: null,
          failureMessage: null,
        },
      });
      if (reset.count === 0) continue; // changed meanwhile (refunded, retried)
      await this.fireTransfer(id);
      retried++;
    }
    return retried;
  }

  /** Admin list of payouts by status (default `failed`), newest first. */
  static async listForAdmin(params: {
    status?: PayoutStatus;
    failureReason?: PayoutFailureReason;
    page: number;
    limit: number;
  }) {
    const where: Prisma.PayoutWhereInput = {
      status: params.status ?? PayoutStatus.failed,
      ...(params.failureReason ? { failureReason: params.failureReason } : {}),
    };
    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          providerUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.payout.count({ where }),
    ]);
    return {
      payouts,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  /**
   * Claws back (part of) a payout after its source is cancelled/refunded —
   * `EventCheckoutSvc.cancelEvent`'s counterpart to `fireTransfer`. Never
   * throws, same as `fireTransfer`: a refund must still go through and the
   * Event must still get marked cancelled even if this fails, so failures
   * are logged and left for manual reconciliation rather than blocking the
   * caller.
   *
   * Two real cases, one no-op:
   *  - `paid` (a real Stripe Transfer already fired): reverse it for the
   *    refunded amount, capped at what the provider actually received.
   *  - `pending`/`failed` (never transferred, or already failed): nothing
   *    to claw back — update the row so it no longer looks payable, in case
   *    anything ever retries pending payouts.
   *  - No Payout row for this source at all: nothing was ever computed for
   *    it (e.g. the invoice was never paid) — no-op.
   */
  static async reversePayoutForSource(
    sourceId: string,
    refundedAmount: Prisma.Decimal | number,
    /**
     * Which payout on this source: an investor's revenue-share payout shares
     * the owner's `sourceId`, so callers that know the recipient pass it.
     */
    target: { providerId?: string; sourceType?: PayoutSourceType } = {},
  ): Promise<void> {
    const payout = await prisma.payout.findFirst({
      where: {
        sourceId,
        ...(target.providerId ? { providerId: target.providerId } : {}),
        ...(target.sourceType ? { sourceType: target.sourceType } : {}),
      },
    });
    if (!payout) return;

    const refundedNum =
      refundedAmount instanceof Prisma.Decimal
        ? refundedAmount.toNumber()
        : refundedAmount;
    if (refundedNum <= 0) return;

    if (payout.status === PayoutStatus.paid) {
      if (!payout.providerReference) return; // paid with no transfer id shouldn't happen, but nothing to reverse against
      const reverseAmount = Math.min(
        refundedNum,
        payout.payoutAmount.toNumber(),
      );
      try {
        await stripe.transfers.createReversal(payout.providerReference, {
          amount: toStripeCents(reverseAmount),
        });
      } catch (e: unknown) {
        const err = e as Error;
        console.error(
          `Payout reversal failed for ${payout.id} (transfer ${payout.providerReference}): ${err.message ?? "unknown error"}`,
        );
      }
      return;
    }

    // `pending` or `failed`: normally nothing moved, so nothing to claw back.
    // Mark it so no retry (onboarding or admin, api#363) ever pays a line the
    // client got their money back for. A transfer still in flight is caught
    // by markPaid, which then reverses it.
    const voided = await prisma.payout.updateMany({
      where: {
        id: payout.id,
        status: { in: [PayoutStatus.pending, PayoutStatus.failed] },
      },
      data: {
        status: PayoutStatus.failed,
        failureReason: PayoutFailureReason.source_refunded,
        failureMessage: "The booking line was cancelled or refunded",
      },
    });
    // An earlier attempt may have sent a transfer and failed to record it
    // (the row stayed pending). Find it by its payout id and pull it back.
    if (voided.count > 0 && payout.transferAttempts > 0) {
      await this.reverseUnrecordedTransfer(payout);
    }
  }

  /** See reversePayoutForSource. Never throws. */
  private static async reverseUnrecordedTransfer(payout: {
    id: string;
    sourceId: string;
    providerId: string;
  }): Promise<void> {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: payout.providerId },
        select: {
          stripeAccountId: true,
          paymentAccount: { select: { stripeAccountId: true } },
        },
      });
      const destination =
        recipient?.paymentAccount?.stripeAccountId ||
        recipient?.stripeAccountId;
      if (!destination) return;
      const sent = await this.findSentTransfer(
        payout.id,
        payout.sourceId,
        destination,
      );
      if (sent) await this.reverseSentTransfer(payout.id, sent.id);
    } catch (e: unknown) {
      console.error(
        `Payout ${payout.id}: couldn't check Stripe for a transfer sent before its line was cancelled: ${(e as Error).message ?? "unknown error"}`,
      );
    }
  }

  private static async createAndFire(data: {
    providerId: string;
    sourceType: PayoutSourceType;
    sourceId: string;
    amount: number;
    /** The client's payment this is funded from; see `fireTransfer`. */
    paymentReference?: string | null;
  }) {
    const { paymentReference, ...record } = data;
    // Nothing to pay (a Direct venue booking's ₱0 EventFoxer markup, a
    // commission on lines that were never charged): no row, since Stripe
    // would refuse the transfer and it would sit in the admin list.
    if (!this.isPayable(record.amount)) return;
    const payout = await this.createPayoutRecord(record);
    await this.fireTransfer(payout.id, { paymentReference });
  }

  /**
   * Pure computation shared by both payout-computing entry points in this
   * codebase (this file's `createPayoutsForEventBooking`, and
   * `payment/payout.service.ts`'s invoice-driven `allocatePayouts`) — the
   * two differ in how they arrive at a resource owner's gross payout amount
   * (raw `agreedPrice` here vs subtracting platform/gateway fees there), but
   * once that amount exists, splitting it with an investor is the same
   * arithmetic either way. Extracted so that arithmetic exists in one place
   * instead of being copied per caller.
   *
   * Splits `ownerAmount` between the resource owner (venue mayor / event
   * organizer) and any active investor(s) who pledged capital against that
   * same venue/event with a `revenueSharePercent` — a revenue-share
   * agreement between the investor and the resource owner, not a platform
   * fee, so it comes out of the owner's own cut rather than the citizen's
   * total or the platform's fee. Combined investor shares are capped at
   * 100% so the owner's remaining cut never goes negative.
   *
   * Read-only: does not create or fire any Payout. Callers own that, since
   * one fires a Stripe transfer immediately (`createAndFire`) and the other
   * defers it until after its own DB transaction commits.
   */
  static async resolveInvestorSplit(
    db: {
      partnerInvestment: { findMany: typeof prisma.partnerInvestment.findMany };
    },
    ownerAmount: number,
    target: { targetVenueId: string } | { targetEventId: string },
  ): Promise<{
    ownerAmount: number;
    investorCuts: { partnerId: string; amount: number }[];
  }> {
    const investments = await db.partnerInvestment.findMany({
      where: {
        ...target,
        status: "active",
        revenueSharePercent: { not: null, gt: 0 },
      },
      select: { partnerId: true, revenueSharePercent: true },
    });
    if (investments.length === 0) return { ownerAmount, investorCuts: [] };

    let remainingPercent = 100;
    let remainingOwnerAmount = ownerAmount;
    const investorCuts: { partnerId: string; amount: number }[] = [];
    for (const inv of investments) {
      const percent = Math.min(inv.revenueSharePercent!, remainingPercent);
      if (percent <= 0) continue;
      remainingPercent -= percent;
      const cut = ownerAmount * (percent / 100);
      remainingOwnerAmount -= cut;
      investorCuts.push({ partnerId: inv.partnerId, amount: cut });
    }
    return { ownerAmount: remainingOwnerAmount, investorCuts };
  }

  /**
   * This file's own callers all want the immediate-fire behavior every
   * other payout in `createPayoutsForEventBooking` uses — this wraps
   * `resolveInvestorSplit` with that, so callers here stay one-liners.
   */
  private static async splitForInvestors(
    amount: number,
    target: { targetVenueId: string } | { targetEventId: string },
    sourceId: string,
    jobs: Promise<void>[],
    paymentReference: string | null = null,
  ): Promise<number> {
    const { ownerAmount, investorCuts } = await this.resolveInvestorSplit(
      prisma,
      amount,
      target,
    );
    for (const cut of investorCuts) {
      jobs.push(
        this.createAndFire({
          providerId: cut.partnerId,
          sourceType: PayoutSourceType.investor_revenue_share,
          // Same sourceId as the owner's own payout for this transaction —
          // the (sourceType, sourceId, providerId) unique constraint still
          // holds because providerId (this investor) differs, and keeping
          // sourceId unqualified means it still points straight at the
          // originating transaction/booking row for later lookups.
          sourceId,
          amount: cut.amount,
          paymentReference,
        }),
      );
    }
    return ownerAmount;
  }

  /**
   * Whether a booking's voucher discount is absorbed by the platform (the
   * usual case — admin/platform-wide Promotion, providerId null) or by the
   * provider themselves (their own Promotion, scoped to their own listing).
   * A booking with no voucher at all reads as platform-absorbed (a no-op,
   * since discountAmount is 0 either way).
   */
  private static async isProviderFundedDiscount(
    voucherId: string | null,
  ): Promise<boolean> {
    if (!voucherId) return false;
    const voucher = await prisma.voucher.findUnique({
      where: { id: voucherId },
      select: { promotion: { select: { providerId: true } } },
    });
    return voucher?.promotion.providerId != null;
  }

  /** Single-recipient payout: the Asset's owner gets totalAmount - platformFeeAmount. */
  static async createPayoutsForAssetBooking(bookingId: string) {
    const booking = await prisma.assetBooking.findUnique({
      where: { id: bookingId },
      include: { asset: { include: { owner: true } } },
    });
    if (!booking) return;

    const providerFunded = await this.isProviderFundedDiscount(
      booking.voucherId,
    );

    const results = await Promise.allSettled([
      this.createAndFire({
        providerId: booking.asset.ownerId,
        sourceType: PayoutSourceType.event_asset_transaction,
        sourceId: booking.id,
        // + discountAmount: a voucher discount is normally absorbed by the
        // platform, not the provider (same rule payment/payout.service.ts's
        // Central Payment path documents) — totalAmount already has the
        // discount subtracted out, so it's added back here to restore the
        // provider's full pre-discount cut. Skipped when the voucher is the
        // provider's own (isProviderFundedDiscount) — they chose to discount
        // their own listing, so they eat that cost, not the platform.
        amount: providerFunded
          ? booking.totalAmount.sub(booking.platformFeeAmount).toNumber()
          : booking.totalAmount
              .sub(booking.platformFeeAmount)
              .add(booking.discountAmount)
              .toNumber(),
        paymentReference: await this.itemBookingPaymentReference({
          stripePaymentId: booking.stripePaymentId,
          assetBookingId: booking.id,
        }),
      }),
    ]);
    this.logFailures(results, "assetBooking", bookingId);
  }

  /** Single-recipient payout: the Service's owner gets totalAmount - platformFeeAmount (+ any voucher discount, which the platform absorbs — unless the voucher was the provider's own). */
  static async createPayoutsForServiceBooking(bookingId: string) {
    const booking = await prisma.serviceBooking.findUnique({
      where: { id: bookingId },
      include: { service: { include: { owner: true } } },
    });
    if (!booking) return;

    const providerFunded = await this.isProviderFundedDiscount(
      booking.voucherId,
    );

    const results = await Promise.allSettled([
      this.createAndFire({
        providerId: booking.service.ownerId,
        sourceType: PayoutSourceType.event_service_transaction,
        sourceId: booking.id,
        amount: providerFunded
          ? booking.totalAmount.sub(booking.platformFeeAmount).toNumber()
          : booking.totalAmount
              .sub(booking.platformFeeAmount)
              .add(booking.discountAmount)
              .toNumber(),
        paymentReference: await this.itemBookingPaymentReference({
          stripePaymentId: booking.stripePaymentId,
          serviceBookingId: booking.id,
        }),
      }),
    ]);
    this.logFailures(results, "serviceBooking", bookingId);
  }

  /**
   * The client's payment for a direct Asset/Service booking: the booking's own
   * PaymentIntent, or else its paid Central Payment row.
   */
  private static async itemBookingPaymentReference(booking: {
    stripePaymentId: string | null;
    assetBookingId?: string;
    serviceBookingId?: string;
  }): Promise<string | null> {
    if (booking.stripePaymentId) return booking.stripePaymentId;
    const payment = await prisma.payment.findFirst({
      where: {
        ...(booking.assetBookingId
          ? { assetBookingId: booking.assetBookingId }
          : { serviceBookingId: booking.serviceBookingId }),
        status: { in: ["paid", "partially_refunded"] },
        providerReference: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { providerReference: true },
    });
    return payment?.providerReference ?? null;
  }

  /**
   * Multi-recipient fan-out for an Event booking: one Payout per included
   * asset/service/venue transaction, plus one to the Host for their markup.
   * The platform's own platformFeeAmount is never paid out — it simply stays
   * in the platform's Stripe balance (Separate Charges and Transfers).
   */
  /**
   * The EventFoxer's commission for a booking (#264 T13.1). On an Event
   * paid through an invoice with the per-line breakdown, the commission the
   * client was actually charged on each line (`chargedLines`, from the
   * invoice), so an item added after booking pays its commission too, and a
   * line that was never charged (or was rejected or cancelled since) pays
   * none. Otherwise (an older Event, or one paid through an older invoice)
   * the Event's markup, as before. The FoxPassport fee and processing fee
   * are never paid to anyone (T13.2).
   */
  static eventFoxerCommission(
    booking: {
      event: { hostMarkupAmount: Prisma.Decimal };
      assetTransactions: { id: string; status: TransactionStatus }[];
      serviceTransactions: { id: string; status: TransactionStatus }[];
      venueTransactions: { id: string; status: TransactionStatus }[];
    },
    chargedLines: Map<string, EventChargeLine>,
  ): Prisma.Decimal {
    if (chargedLines.size === 0) return booking.event.hostMarkupAmount;
    return [
      ...booking.assetTransactions,
      ...booking.serviceTransactions,
      ...booking.venueTransactions,
    ]
      .filter((tx) => !UNPAID_LINE_STATUSES.has(tx.status))
      .reduce(
        (sum, tx) => sum.add(chargedLines.get(tx.id)?.commission ?? 0),
        new Prisma.Decimal(0),
      );
  }

  /** The lines a booking's paid Event invoice charged, by transaction id. */
  private static async chargedLinesForBooking(booking: {
    assetTransactions: { id: string }[];
    serviceTransactions: { id: string }[];
    venueTransactions: { id: string }[];
  }): Promise<Map<string, EventChargeLine>> {
    const ids = [
      ...booking.assetTransactions,
      ...booking.serviceTransactions,
      ...booking.venueTransactions,
    ].map((tx) => tx.id);
    if (ids.length === 0) return new Map();
    const invoice = await prisma.invoice.findFirst({
      where: {
        status: { in: ["paid", "partially_refunded"] },
        items: { some: { sourceId: { in: ids } } },
      },
      orderBy: { createdAt: "desc" },
      select: { platformFeeSnapshot: true },
    });
    return eventBreakdownLines(invoice?.platformFeeSnapshot);
  }

  /**
   * The client's charge behind each line of an Event booking, so each
   * transfer can be funded from the charge that paid for it: the paid
   * Central Payment invoice that charged the line, else the booking's own
   * PaymentIntent (an older Event or a direct venue booking). `latest` funds
   * the EventFoxer's commission, which spans the lines. Values are charge
   * ids (`ch_…`), or null when none could be resolved.
   */
  private static async eventPaymentReferences(booking: {
    stripePaymentId: string | null;
    assetTransactions: { id: string }[];
    serviceTransactions: { id: string }[];
    venueTransactions: { id: string }[];
  }): Promise<{
    byLine: Map<string, string | null>;
    latest: string | null;
  }> {
    const ids = [
      ...booking.assetTransactions,
      ...booking.serviceTransactions,
      ...booking.venueTransactions,
    ].map((tx) => tx.id);
    const byLine = new Map<string, string>();
    let latest: string | null = null;
    if (ids.length > 0) {
      const invoices = await prisma.invoice.findMany({
        where: {
          status: { in: ["paid", "partially_refunded"] },
          items: { some: { sourceId: { in: ids } } },
        },
        orderBy: { createdAt: "asc" },
        select: {
          items: { select: { sourceId: true } },
          payments: {
            where: {
              status: { in: ["paid", "partially_refunded", "refunded"] },
              providerReference: { not: null },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { providerReference: true },
          },
        },
      });
      // Oldest first, so a line charged again later maps to the later charge.
      for (const invoice of invoices) {
        const ref = invoice.payments[0]?.providerReference;
        if (!ref) continue;
        latest = ref;
        for (const item of invoice.items) byLine.set(item.sourceId, ref);
      }
    }
    latest ??= booking.stripePaymentId;

    // Resolve each PaymentIntent to its charge once here, rather than once
    // per payout in fireTransfer: an Event's lines usually share one payment.
    // A reference that can't be resolved becomes null, so fireTransfer
    // doesn't ask Stripe again and transfers from the balance.
    const charges = new Map<string, string | null>();
    for (const ref of new Set([
      ...byLine.values(),
      ...(latest ? [latest] : []),
    ])) {
      charges.set(ref, await this.resolveChargeId(ref));
    }
    const chargeOf = (ref: string | null) =>
      ref ? (charges.get(ref) ?? null) : null;
    return {
      byLine: new Map([...byLine].map(([line, ref]) => [line, chargeOf(ref)])),
      latest: chargeOf(latest),
    };
  }

  static async createPayoutsForEventBooking(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: true,
        assetTransactions: { where: { included: true } },
        serviceTransactions: { where: { included: true } },
        venueTransactions: { where: { included: true } },
      },
    });
    if (!booking) return;

    const jobs: Promise<void>[] = [];
    const payments = await this.eventPaymentReferences(booking);
    const lineRef = (lineId: string) =>
      payments.byLine.get(lineId) ?? payments.latest;

    // sourceId is the transaction row's own id (not booking.id) — necessary because
    // a single provider can supply more than one item to the same event (e.g. two
    // separate Assets owned by the same Foxer). Using booking.id alone would collide
    // on the (sourceType, sourceId, providerId) unique constraint and silently
    // drop the second item's payout.
    for (const tx of booking.assetTransactions) {
      jobs.push(
        this.createAndFire({
          providerId: tx.providerId,
          sourceType: PayoutSourceType.event_asset_transaction,
          sourceId: tx.id,
          amount: tx.agreedPrice.toNumber(),
          paymentReference: lineRef(tx.id),
        }),
      );
    }
    for (const tx of booking.serviceTransactions) {
      jobs.push(
        this.createAndFire({
          providerId: tx.providerId,
          sourceType: PayoutSourceType.event_service_transaction,
          sourceId: tx.id,
          amount: tx.agreedPrice.toNumber(),
          paymentReference: lineRef(tx.id),
        }),
      );
    }
    // A direct venue booking (the only case Event.voucherId is ever set —
    // see its schema comment) has exactly one venueTransaction and no
    // asset/service transactions, so the whole event's discount belongs
    // unambiguously to that one row. `agreedPrice` was already stored net of
    // the discount (BookingSvc.createBooking); add it back here only when
    // the voucher was platform-funded, restoring the venue owner's full cut
    // the same way createPayoutsForAssetBooking/ForServiceBooking do.
    const isDirectVenueBooking =
      booking.venueTransactions.length === 1 &&
      booking.assetTransactions.length === 0 &&
      booking.serviceTransactions.length === 0;
    const venueDiscountAddBack =
      isDirectVenueBooking &&
      (await this.isProviderFundedDiscount(booking.event.voucherId))
        ? new Prisma.Decimal(0)
        : booking.event.discountAmount;

    for (const tx of booking.venueTransactions) {
      const agreedPriceForPayout = isDirectVenueBooking
        ? tx.agreedPrice.add(venueDiscountAddBack)
        : tx.agreedPrice;
      const ownerAmount = await this.splitForInvestors(
        agreedPriceForPayout.toNumber(),
        { targetVenueId: tx.venueId },
        tx.id,
        jobs,
        lineRef(tx.id),
      );
      jobs.push(
        this.createAndFire({
          providerId: tx.providerId,
          sourceType: PayoutSourceType.event_venue_transaction,
          sourceId: tx.id,
          amount: ownerAmount,
          paymentReference: lineRef(tx.id),
        }),
      );
    }
    // Host's own cut — one per booking (sourceId = booking.id is fine here, there's
    // only ever one Host per Event).
    const chargedLines = await this.chargedLinesForBooking(booking);
    const hostAmount = await this.splitForInvestors(
      this.eventFoxerCommission(booking, chargedLines).toNumber(),
      { targetEventId: booking.eventId },
      booking.id,
      jobs,
      payments.latest,
    );
    jobs.push(
      this.createAndFire({
        providerId: booking.event.organizerId,
        sourceType: PayoutSourceType.event_host_markup,
        sourceId: booking.id,
        amount: hostAmount,
        paymentReference: payments.latest,
      }),
    );

    const results = await Promise.allSettled(jobs);
    this.logFailures(results, "booking", bookingId);
  }

  private static logFailures(
    results: PromiseSettledResult<void>[],
    sourceType: string,
    sourceId: string,
  ) {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(
          `Payout job failed for ${sourceType} ${sourceId}`,
          r.reason,
        );
      }
    }
  }
}
