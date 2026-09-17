import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import { PayoutSourceType, PayoutStatus, Prisma } from "@prisma/client";
import { STRIPE_SECRET_KEY } from "../../config";
import { toStripeCents } from "../../utils/pricing";

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

  /** Fires the actual Stripe Transfer for an existing (pending) Payout row. Never throws. */
  static async fireTransfer(payoutId: string): Promise<void> {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { providerUser: true },
    });
    if (!payout) return;
    if (payout.status !== PayoutStatus.pending) return; // already paid or failed, don't retry blindly

    const recipient = payout.providerUser;
    if (!recipient.stripeAccountId || !recipient.stripePayoutsEnabled) {
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.failed,
        },
      });
      console.error(
        `Payout ${payoutId} failed: recipient ${recipient.id} has not completed Stripe Connect onboarding`,
      );
      return;
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: toStripeCents(payout.payoutAmount.toNumber()),
        currency: "php",
        destination: recipient.stripeAccountId,
        transfer_group: payout.sourceId,
      });
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.paid,
          providerReference: transfer.id,
          paidAt: new Date(),
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.failed,
        },
      });
      console.error(
        `Payout ${payoutId} Stripe transfer failed: ${err.message ?? "unknown error"}`,
      );
    }
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
  ): Promise<void> {
    const payout = await prisma.payout.findFirst({ where: { sourceId } });
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

    if (payout.status === PayoutStatus.pending) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.failed },
      });
    }
    // already `failed`: nothing moved, nothing to do.
  }

  private static async createAndFire(data: {
    providerId: string;
    sourceType: PayoutSourceType;
    sourceId: string;
    amount: number;
  }) {
    const payout = await this.createPayoutRecord(data);
    await this.fireTransfer(payout.id);
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
      }),
    ]);
    this.logFailures(results, "serviceBooking", bookingId);
  }

  /**
   * Multi-recipient fan-out for an Event booking: one Payout per included
   * asset/service/venue transaction, plus one to the Host for their markup.
   * The platform's own platformFeeAmount is never paid out — it simply stays
   * in the platform's Stripe balance (Separate Charges and Transfers).
   */
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
      );
      jobs.push(
        this.createAndFire({
          providerId: tx.providerId,
          sourceType: PayoutSourceType.event_venue_transaction,
          sourceId: tx.id,
          amount: ownerAmount,
        }),
      );
    }
    // Host's own cut — one per booking (sourceId = booking.id is fine here, there's
    // only ever one Host per Event).
    const hostAmount = await this.splitForInvestors(
      booking.event.hostMarkupAmount.toNumber(),
      { targetEventId: booking.eventId },
      booking.id,
      jobs,
    );
    jobs.push(
      this.createAndFire({
        providerId: booking.event.organizerId,
        sourceType: PayoutSourceType.event_host_markup,
        sourceId: booking.id,
        amount: hostAmount,
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
