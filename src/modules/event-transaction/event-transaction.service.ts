import EventTransactionRepo from "./event-transaction.repository";
import EventRequestRepo from "../event-request/event-request.repository";
import EventTemplateRepo from "../event-template/event-template.repository";
import PricingSvc from "../pricing/pricing.service";
import { commissionPctOf, lineSnapshot } from "../pricing/event-breakdown";
import { TransactionStatus } from "@prisma/client";
import { prisma, AppTransactionClient } from "../../utils/prisma";
import { bookingLink } from "../../utils/notification-links";
import AvailabilitySvc from "../availability/availability.service";
import TransactionStatusSvc from "../transaction-status/transaction-status.service";
import NotificationSvc from "../notifications/user-notification.service";
import { eventLink } from "./event-conflict.service";
import type { DeclineCause } from "../transaction-status/transaction-status.service";
import {
  TransactionKind,
  TransactionAction,
} from "../transaction-status/transaction-status.types";
import { hasAgreed } from "../event-template/template-partners";

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
    // Read through the caller's transaction when there is one: the match flow
    // creates this Event (and maybe its template) in it, and the bare client
    // can't see either until commit, so every match request failed (api#465).
    const reader = externalTx ?? prisma;
    const event = await EventRequestRepo.findById(eventId, reader);
    if (!event) throw new Error("Event not found");
    if (!event.templateId)
      throw new Error(
        "Event has no template — cannot create template-based transactions",
      );

    const template = await EventTemplateRepo.findTemplateById(
      event.templateId,
      reader,
    );
    if (!template) throw new Error("Template not found");

    // How each line is priced (#264 T7.1): with the rate stored on the Event
    // when it was priced, so the rows match what the client was quoted. An
    // Event priced before per-Event rates existed stores no snapshot and
    // keeps its old prices.
    const snapshots = new Map<string, ReturnType<typeof lineSnapshot>>();
    if (event.commissionPct != null) {
      const breakdown = await PricingSvc.calculateEventBreakdown(
        template,
        commissionPctOf(event.commissionPct),
        undefined,
        { eventFoxerId: template.ownerId },
      );
      for (const line of breakdown.lines) {
        if (line.itemId) snapshots.set(line.itemId, lineSnapshot(line));
      }
    }

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
          eventId: event.id,
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
              ...snapshots.get(item.id),
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
              ...snapshots.get(item.id),
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
              ...snapshots.get(item.id),
              currency: item.currency,
              status: hasAgreed(item)
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
    cause?: DeclineCause,
  ) {
    const updated = await prisma.$transaction((tx) =>
      TransactionStatusSvc.transition(tx, {
        id,
        kind: type,
        action,
        actorId,
        cause,
      }),
    );
    if (action === "decline") {
      await this.notifyDeclined(type, updated, cause).catch((err) =>
        console.error(`Decline notification failed for ${type} ${id}`, err),
      );
    }
    return updated;
  }

  /**
   * Tells the Event Foxer which event lost which Supplier (so they can find a
   * replacement) and tells the citizen their booking is affected. The decline
   * has already committed, so this is best-effort and never fails the request.
   */
  private static async notifyDeclined(
    kind: TransactionKind,
    row: {
      id: string;
      eventId: string;
      bookingId: string | null;
      providerId: string;
    },
    cause?: DeclineCause,
  ) {
    const [event, supplier, itemName, booking] = await Promise.all([
      prisma.event.findUnique({
        where: { id: row.eventId },
        select: { name: true, organizerId: true, clientId: true },
      }),
      prisma.user.findUnique({
        where: { id: row.providerId },
        select: { name: true },
      }),
      this.itemNameOf(kind, row.id),
      row.bookingId
        ? prisma.booking.findUnique({
            where: { id: row.bookingId },
            select: { userId: true },
          })
        : null,
    ]);
    if (!event) return;
    const metadata = { eventId: row.eventId, transactionId: row.id, kind };

    await NotificationSvc.create({
      userId: event.organizerId,
      type: "SUPPLIER_DECLINED",
      title: "A Supplier declined your event",
      message: `${supplier?.name ?? "A Supplier"} ${cause === "busy" ? "is busy with another booking and declined" : "declined"} ${itemName} for ${event.name}. Pick a replacement.`,
      metadata: { ...metadata, link: eventLink(row.eventId) },
    });

    const citizenId = booking?.userId ?? event.clientId;
    if (citizenId && citizenId !== event.organizerId) {
      await NotificationSvc.create({
        userId: citizenId,
        type: "SUPPLIER_DECLINED",
        title: "Part of your booking changed",
        message: `${itemName} for ${event.name} was declined by its Supplier. The event host has been asked to replace it.`,
        metadata: {
          ...metadata,
          ...(row.bookingId ? { link: bookingLink(row.bookingId) } : {}),
        },
      });
    }
  }

  private static async itemNameOf(kind: TransactionKind, id: string) {
    const name =
      kind === "asset"
        ? (
            await prisma.eventAssetTransaction.findUnique({
              where: { id },
              select: { asset: { select: { name: true } } },
            })
          )?.asset?.name
        : kind === "service"
          ? (
              await prisma.eventServiceTransaction.findUnique({
                where: { id },
                select: { service: { select: { name: true } } },
              })
            )?.service?.name
          : (
              await prisma.eventVenueTransaction.findUnique({
                where: { id },
                select: { venue: { select: { name: true } } },
              })
            )?.venue?.name;
    return name ?? "an item";
  }
}
