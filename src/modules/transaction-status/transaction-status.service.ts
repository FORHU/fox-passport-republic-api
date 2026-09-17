import { TransactionStatus } from "@prisma/client";
import { AppTransactionClient } from "../../utils/prisma";
import {
  TransactionKind,
  TransactionAction,
  isWithinDeadline,
  InvalidTransitionError,
  TransactionActorUnauthorizedError,
  DeadlinePassedError,
} from "./transaction-status.types";

/**
 * The ONLY permitted writer of EventAssetTransaction/EventServiceTransaction/
 * EventVenueTransaction status. Controllers must call `transition` with a
 * fixed `action`, never a raw status string — this is what closes the
 * previously-live PATCH /event-transactions/:id/review gap, which accepted
 * any TransactionStatus enum value with no validation of the current row's
 * state at all.
 *
 * Authorization and kind validation both happen IN HERE, not the controller:
 * the row is re-fetched under its own lock and the actor is checked against
 * the row's own providerId/booking-owner field, never a controller-passed
 * claim. Kind confusion is closed structurally — each kind queries its own
 * physical table, so a wrong (kind, id) pair is simply "not found."
 */

// (kind, fromStatus, action) -> toStatus. Absent entries are invalid
// transitions by construction, not by a growing set of special-case checks.
const ALLOWED_TRANSITIONS: Record<
  string,
  TransactionStatus
> = {
  "asset:pending_provider_confirmation:confirm": TransactionStatus.approved,
  "asset:pending_provider_confirmation:reject": TransactionStatus.rejected,
  "asset:pending_provider_confirmation:expire": TransactionStatus.rejected,
  "asset:pending_provider_confirmation:cancel": TransactionStatus.cancelled,
  "asset:approved:cancel": TransactionStatus.cancelled,

  "service:pending_provider_confirmation:confirm": TransactionStatus.approved,
  "service:pending_provider_confirmation:reject": TransactionStatus.rejected,
  "service:pending_provider_confirmation:expire": TransactionStatus.rejected,
  "service:pending_provider_confirmation:cancel": TransactionStatus.cancelled,
  "service:approved:cancel": TransactionStatus.cancelled,

  // Venue rows never enter pending_provider_confirmation (Phase A's
  // affiliation gate is the venue's consent step) — only cancel applies,
  // from either of its two possible starting statuses.
  "venue:pending:cancel": TransactionStatus.cancelled,
  "venue:approved:cancel": TransactionStatus.cancelled,
};

// action -> rejectionReason. Deliberately not client-suppliable — reject and
// expire are the only actions that produce a reason, and each has exactly
// one meaning, set here, never accepted as free text from a request body.
const REJECTION_REASON: Partial<Record<TransactionAction, string>> = {
  reject: "provider_declined",
  expire: "deadline_expired",
};

interface TransitionArgs {
  id: string;
  kind: TransactionKind;
  action: TransactionAction;
  actorId?: string; // omitted only for the system-driven "expire" action
}

export default class TransactionStatusSvc {
  static async transition(tx: AppTransactionClient, args: TransitionArgs) {
    switch (args.kind) {
      case "asset":
        return this.transitionAsset(tx, args);
      case "service":
        return this.transitionService(tx, args);
      case "venue":
        return this.transitionVenue(tx, args);
    }
  }

  private static async dbNow(tx: AppTransactionClient): Promise<Date> {
    const rows: { now: Date }[] = await tx.$queryRaw`SELECT NOW() as now`;
    return rows[0].now;
  }

  private static resolveTransition(
    kind: TransactionKind,
    fromStatus: TransactionStatus,
    action: TransactionAction,
  ): TransactionStatus {
    const key = `${kind}:${fromStatus}:${action}`;
    const toStatus = ALLOWED_TRANSITIONS[key];
    if (!toStatus) throw new InvalidTransitionError(kind, fromStatus, action);
    return toStatus;
  }

  private static async transitionAsset(
    tx: AppTransactionClient,
    { id, action, actorId }: TransitionArgs,
  ) {
    await tx.$executeRaw`SELECT id FROM event_asset_transactions WHERE id = ${id} FOR UPDATE`;

    const row = await tx.eventAssetTransaction.findUniqueOrThrow({
      where: { id },
      include: { booking: { select: { userId: true } } },
    });

    if (action === "confirm" || action === "reject") {
      if (!actorId || row.providerId !== actorId) {
        throw new TransactionActorUnauthorizedError(
          "Unauthorized: only the provider for this item can confirm or reject it",
        );
      }
    } else if (action === "cancel") {
      if (!row.bookingId || !row.booking) {
        throw new Error("This item is not yet attached to a booking to cancel");
      }
      if (!actorId || row.booking.userId !== actorId) {
        throw new TransactionActorUnauthorizedError(
          "Unauthorized: only the booking owner can cancel this item",
        );
      }
    }
    // action === "expire": system-driven, no actor check.

    const toStatus = this.resolveTransition("asset", row.status, action);

    if (action === "confirm" || action === "expire") {
      const now = await this.dbNow(tx);
      const withinDeadline = isWithinDeadline(now, row.confirmationDeadline);
      if (action === "confirm" && !withinDeadline) {
        throw new DeadlinePassedError(
          "The confirmation deadline for this item has passed",
        );
      }
      if (action === "expire" && withinDeadline) {
        // Deadline hasn't actually passed yet by the DB's own clock — the
        // sweep job must not expire a row prematurely just because it ran.
        throw new InvalidTransitionError("asset", row.status, action);
      }
    }

    return tx.eventAssetTransaction.update({
      where: { id, status: row.status }, // optimistic re-check, defense in depth alongside the FOR UPDATE lock
      data: {
        status: toStatus,
        rejectionReason: REJECTION_REASON[action] ?? row.rejectionReason,
      },
    });
  }

  private static async transitionService(
    tx: AppTransactionClient,
    { id, action, actorId }: TransitionArgs,
  ) {
    await tx.$executeRaw`SELECT id FROM event_service_transactions WHERE id = ${id} FOR UPDATE`;

    const row = await tx.eventServiceTransaction.findUniqueOrThrow({
      where: { id },
      include: { booking: { select: { userId: true } } },
    });

    if (action === "confirm" || action === "reject") {
      if (!actorId || row.providerId !== actorId) {
        throw new TransactionActorUnauthorizedError(
          "Unauthorized: only the provider for this item can confirm or reject it",
        );
      }
    } else if (action === "cancel") {
      if (!row.bookingId || !row.booking) {
        throw new Error("This item is not yet attached to a booking to cancel");
      }
      if (!actorId || row.booking.userId !== actorId) {
        throw new TransactionActorUnauthorizedError(
          "Unauthorized: only the booking owner can cancel this item",
        );
      }
    }

    const toStatus = this.resolveTransition("service", row.status, action);

    if (action === "confirm" || action === "expire") {
      const now = await this.dbNow(tx);
      const withinDeadline = isWithinDeadline(now, row.confirmationDeadline);
      if (action === "confirm" && !withinDeadline) {
        throw new DeadlinePassedError(
          "The confirmation deadline for this item has passed",
        );
      }
      if (action === "expire" && withinDeadline) {
        throw new InvalidTransitionError("service", row.status, action);
      }
    }

    return tx.eventServiceTransaction.update({
      where: { id, status: row.status },
      data: {
        status: toStatus,
        rejectionReason: REJECTION_REASON[action] ?? row.rejectionReason,
      },
    });
  }

  private static async transitionVenue(
    tx: AppTransactionClient,
    { id, action, actorId }: TransitionArgs,
  ) {
    await tx.$executeRaw`SELECT id FROM event_venue_transactions WHERE id = ${id} FOR UPDATE`;

    const row = await tx.eventVenueTransaction.findUniqueOrThrow({
      where: { id },
      include: { booking: { select: { userId: true } } },
    });

    if (action !== "cancel") {
      // No (venue, *, confirm|reject|expire) entry exists in the allow-list
      // either, so this would fail resolveTransition anyway — this check
      // just gives a clearer error for the venue case specifically.
      throw new InvalidTransitionError("venue", row.status, action);
    }

    if (!row.bookingId || !row.booking) {
      throw new Error("This item is not yet attached to a booking to cancel");
    }
    if (!actorId || row.booking.userId !== actorId) {
      throw new TransactionActorUnauthorizedError(
        "Unauthorized: only the booking owner can cancel this item",
      );
    }

    const toStatus = this.resolveTransition("venue", row.status, action);

    return tx.eventVenueTransaction.update({
      where: { id, status: row.status },
      data: { status: toStatus },
    });
  }
}
