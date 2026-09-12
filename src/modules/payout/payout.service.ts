import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import { PayoutSourceType, PayoutStatus } from "@prisma/client";
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
 */
export default class PayoutSvc {
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

  private static async createAndFire(data: {
    providerId: string;
    sourceType: PayoutSourceType;
    sourceId: string;
    amount: number;
  }) {
    const payout = await this.createPayoutRecord(data);
    await this.fireTransfer(payout.id);
  }

  /** Single-recipient payout: the Asset's owner gets totalAmount - platformFeeAmount. */
  static async createPayoutsForAssetBooking(bookingId: string) {
    const booking = await prisma.assetBooking.findUnique({
      where: { id: bookingId },
      include: { asset: { include: { owner: true } } },
    });
    if (!booking) return;

    const results = await Promise.allSettled([
      this.createAndFire({
        providerId: booking.asset.ownerId,
        sourceType: PayoutSourceType.event_asset_transaction,
        sourceId: booking.id,
        amount: booking.totalAmount.sub(booking.platformFeeAmount).toNumber(),
      }),
    ]);
    this.logFailures(results, "assetBooking", bookingId);
  }

  /** Single-recipient payout: the Service's owner gets totalAmount - platformFeeAmount. */
  static async createPayoutsForServiceBooking(bookingId: string) {
    const booking = await prisma.serviceBooking.findUnique({
      where: { id: bookingId },
      include: { service: { include: { owner: true } } },
    });
    if (!booking) return;

    const results = await Promise.allSettled([
      this.createAndFire({
        providerId: booking.service.ownerId,
        sourceType: PayoutSourceType.event_service_transaction,
        sourceId: booking.id,
        amount: booking.totalAmount.sub(booking.platformFeeAmount).toNumber(),
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
    for (const tx of booking.venueTransactions) {
      jobs.push(
        this.createAndFire({
          providerId: tx.providerId,
          sourceType: PayoutSourceType.event_venue_transaction,
          sourceId: tx.id,
          amount: tx.agreedPrice.toNumber(),
        }),
      );
    }
    // Host's own cut — one per booking (sourceId = booking.id is fine here, there's
    // only ever one Host per Event).
    jobs.push(
      this.createAndFire({
        providerId: booking.event.organizerId,
        sourceType: PayoutSourceType.event_host_markup,
        sourceId: booking.id,
        amount: booking.event.hostMarkupAmount.toNumber(),
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
