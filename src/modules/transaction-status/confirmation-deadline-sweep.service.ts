import { prisma } from "../../utils/prisma";
import TransactionStatusSvc from "./transaction-status.service";
import { InvalidTransitionError } from "./transaction-status.types";
import NotificationSvc from "../notifications/user-notification.service";

/**
 * Periodic sweep for ad-hoc marketplace items whose provider never
 * responded before `confirmationDeadline`. The actual deadline comparison
 * (`NOW() <= confirmationDeadline`, using the database's own clock) happens
 * inside `TransactionStatusSvc.transition`'s "expire" action, not here —
 * this query only selects candidates. A candidate a provider confirmed in
 * the gap between this query and its own transition call is expected and
 * benign: `transition` rejects it with InvalidTransitionError (the row is
 * no longer `pending_provider_confirmation`), which this sweep treats as
 * "nothing to do", not a failure.
 */
export default class ConfirmationDeadlineSweepSvc {
  static async runSweep() {
    const now = new Date();

    const [staleAssets, staleServices] = await Promise.all([
      prisma.eventAssetTransaction.findMany({
        where: {
          status: "pending_provider_confirmation",
          confirmationDeadline: { lt: now },
        },
        select: {
          id: true,
          providerId: true,
          bookingId: true,
          asset: { select: { name: true } },
        },
      }),
      prisma.eventServiceTransaction.findMany({
        where: {
          status: "pending_provider_confirmation",
          confirmationDeadline: { lt: now },
        },
        select: {
          id: true,
          providerId: true,
          bookingId: true,
          service: { select: { name: true } },
        },
      }),
    ]);

    let expired = 0;
    let alreadyResolved = 0;
    let failed = 0;

    const expireOne = async (
      kind: "asset" | "service",
      row: {
        id: string;
        providerId: string;
        bookingId: string | null;
        asset?: { name: string } | null;
        service?: { name: string } | null;
      },
    ) => {
      try {
        await prisma.$transaction((tx) =>
          TransactionStatusSvc.transition(tx, {
            id: row.id,
            kind,
            action: "expire",
          }),
        );
        expired++;

        const itemName = row.asset?.name ?? row.service?.name ?? "an item";
        await NotificationSvc.create({
          userId: row.providerId,
          type: "MARKETPLACE_ITEM_EXPIRED",
          title: "Confirmation window expired",
          message: `You didn't respond in time to a request for ${itemName} — it has been released back to availability.`,
          metadata: { transactionId: row.id, kind },
        }).catch(() => {});

        if (row.bookingId) {
          const booking = await prisma.booking.findUnique({
            where: { id: row.bookingId },
            select: { userId: true },
          });
          if (booking) {
            await NotificationSvc.create({
              userId: booking.userId,
              type: "MARKETPLACE_ITEM_EXPIRED",
              title: "An item needs your attention",
              message: `${itemName} wasn't confirmed by the provider in time — remove it or pick a different option before checkout.`,
              metadata: { transactionId: row.id, kind },
            }).catch(() => {});
          }
        }
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          // Resolved (confirmed/rejected/cancelled) in the gap between
          // selection and this transition attempt — not a failure.
          alreadyResolved++;
          return;
        }
        failed++;
        console.error(
          `Confirmation deadline sweep failed for ${kind} transaction ${row.id}`,
          err,
        );
      }
    };

    for (const row of staleAssets) await expireOne("asset", row);
    for (const row of staleServices) await expireOne("service", row);

    return {
      candidates: staleAssets.length + staleServices.length,
      expired,
      alreadyResolved,
      failed,
    };
  }
}
