import EventTransactionRepo from "./event-transaction.repository";
import EventRequestRepo from "../event-request/event-request.repository";
import EventTemplateRepo from "../event-template/event-template.repository";
import { TransactionStatus } from "@prisma/client";
import { prisma, AppTransactionClient } from "../../utils/prisma";
import AvailabilitySvc from "../availability/availability.service";
import TransactionStatusSvc from "../transaction-status/transaction-status.service";
import { TransactionKind, TransactionAction } from "../transaction-status/transaction-status.types";

export default class EventTransactionSvc {
  static async getProviderDashboard(providerId: string) {
    const [assets, services, venues] = await Promise.all([
      EventTransactionRepo.findAssetTransactionsByProvider(providerId),
      EventTransactionRepo.findServiceTransactionsByProvider(providerId),
      EventTransactionRepo.findVenueTransactionsByProvider(providerId),
    ]);

    return {
      assets,
      services,
      venues,
      summary: {
        totalPending:
          assets.filter((a) => a.status === TransactionStatus.pending).length +
          services.filter((s) => s.status === TransactionStatus.pending)
            .length +
          venues.filter((v) => v.status === TransactionStatus.pending).length,
        totalApproved:
          assets.filter((a) => a.status === TransactionStatus.approved).length +
          services.filter((s) => s.status === TransactionStatus.approved)
            .length +
          venues.filter((v) => v.status === TransactionStatus.approved).length,
      },
    };
  }

  /**
   * Wrapped in one transaction — previously a plain `Promise.all` with no
   * transaction at all, meaning this was one of the bypass paths that could
   * create rows with no lock and no availability check. Assets/services now
   * go through AvailabilitySvc.reserve, sequentially, before their insert
   * (never Promise.all against the same `tx` — an interactive transaction
   * shares one connection). Venues are still created here for atomicity but
   * are not passed through AvailabilitySvc — Phase A's affiliation approval
   * is their gate, not date/quantity availability.
   *
   * `externalTx`: when supplied (the match-flow atomicity refactor), this
   * runs inside the caller's own transaction instead of opening a new one —
   * Prisma has no nested-transaction support, so participating means reusing
   * the same client, not calling $transaction again. The standalone
   * POST /event-transactions route (used outside the match flow) calls this
   * with no externalTx and gets its own transaction as before.
   */
  static async createTransactionsFromTemplate(
    eventId: string,
    bookingId: string,
    externalTx?: AppTransactionClient,
  ) {
    const event = await EventRequestRepo.findById(eventId);
    if (!event) throw new Error("Event not found");
    if (!event.templateId)
      throw new Error(
        "Event has no template — cannot create template-based transactions",
      );

    const template = await EventTemplateRepo.findTemplateById(event.templateId);
    if (!template) throw new Error("Template not found");

    const dateRange = { start: event.startAt, end: event.endAt };
    const assetItems = template.templateAssets.filter((item) => item.asset);
    const serviceItems = template.templateServices.filter(
      (item) => item.service,
    );

    const run = async (tx: AppTransactionClient) => {
      await AvailabilitySvc.reserve(tx, [
        ...assetItems.map((item) => ({
          kind: "asset" as const,
          itemId: item.assetId!,
          dateRange,
          quantity: item.quantity,
        })),
        ...serviceItems.map((item) => ({
          kind: "service" as const,
          itemId: item.serviceId!,
          dateRange,
        })),
      ]);

      const created: unknown[] = [];

      for (const item of assetItems) {
        created.push(
          await EventTransactionRepo.createAssetTransaction(
            {
              eventId,
              bookingId,
              assetId: item.assetId!,
              providerId: item.asset!.ownerId,
              quantity: item.quantity,
              agreedPrice: item.asset!.price.toNumber() * item.quantity,
              currency: item.currency,
            },
            tx,
          ),
        );
      }

      for (const item of serviceItems) {
        created.push(
          await EventTransactionRepo.createServiceTransaction(
            {
              eventId,
              bookingId,
              serviceId: item.serviceId!,
              providerId: item.service!.ownerId,
              agreedPrice: item.service!.price,
              currency: item.currency,
            },
            tx,
          ),
        );
      }

      for (const item of template.templateVenues) {
        if (!item.venue) continue;
        created.push(
          await EventTransactionRepo.createVenueTransaction(
            {
              eventId,
              bookingId,
              venueId: item.venueId!,
              providerId: item.venue.mayorId,
              agreedPrice: item.venue.price,
              currency: item.currency,
              status: item.matched
                ? TransactionStatus.approved
                : TransactionStatus.pending,
            },
            tx,
          ),
        );
      }

      return created;
    };

    if (externalTx) return run(externalTx);
    return prisma.$transaction(run);
  }

  /**
   * Rewritten to route through TransactionStatusSvc.transition instead of
   * writing an arbitrary client-supplied status directly.
   *
   * Previously, this method (and the PATCH /event-transactions/:id/review
   * route above it) accepted ANY TransactionStatus enum value from the
   * request body with zero validation of the row's current state — a
   * provider could PATCH a rejected row straight to approved, or approve a
   * row that had never gone through any confirmation step at all. The
   * controller's Joi schema now validates `action` against the fixed
   * ["confirm","reject","cancel"] set instead of the full status enum; this
   * method converts that into a transition call, which is the only
   * remaining writer of these statuses.
   */
  static async reviewItem(
    id: string,
    type: TransactionKind,
    action: TransactionAction,
    actorId: string,
  ) {
    return prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, { id, kind: type, action, actorId }),
    );
  }
}
