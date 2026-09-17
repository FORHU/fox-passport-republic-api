import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import AvailabilitySvc from "../availability/availability.service";

export default class EventRepo {
  /**
   * Events a given host organises, newest first.
   *
   * The `select` is deliberately narrow: the two callers are the Republic Feed
   * compose flow, which needs a real Event id rather than an EventTemplate id,
   * and the host dashboard list. Neither wants the transactions or the client.
   *
   * Moved out of `event.controller.ts` unchanged - it was the whole of that
   * controller, which had no service and no repository at all.
   */
  static async findByOrganizer(
    organizerId: string,
    skip: number,
    take: number,
  ) {
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: { organizerId },
        orderBy: { startAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          name: true,
          startAt: true,
          eventStatus: true,
          targetCity: true,
        },
      }),
      prisma.event.count({ where: { organizerId } }),
    ]);

    return { events, total };
  }

  /**
   * The event a template booking creates.
   *
   * Unchecked rather than connected, because that is how it was written in
   * `booking.controller.ts` and the ids are already in hand. Moved verbatim.
   */
  static async createFromTemplate(data: Prisma.EventUncheckedCreateInput) {
    return prisma.event.create({ data });
  }

  /**
   * Per-partner escrow rows for a template booking - one per included asset,
   * service and venue.
   *
   * They are created together because they are one decision: the booking exists
   * with all of its partners attached, or it does not exist.
   *
   * Rewritten from the array-of-promises `$transaction` this used to be (which
   * ran every insert concurrently with no ordering guarantee, so it could not
   * host a lock-then-check) to the callback form, specifically so
   * AvailabilitySvc.reserve can run — under its own row lock — before each
   * asset/service insert, in the same transaction. Venues are not passed
   * through AvailabilitySvc: venue access is already gated by the Phase A
   * affiliation approval at attach time, not by this date/quantity mechanism.
   * Excluded items (included: false) never consume inventory — the customer
   * chose not to include them, so nothing is reserved on their behalf.
   */
  static async createEscrowTransactions(rows: {
    assets: Prisma.EventAssetTransactionUncheckedCreateInput[];
    services: Prisma.EventServiceTransactionUncheckedCreateInput[];
    venues: Prisma.EventVenueTransactionUncheckedCreateInput[];
    dateRange: { start: Date; end: Date };
  }) {
    return prisma.$transaction(async (tx) => {
      const includedAssets = rows.assets.filter((a) => a.included !== false);
      const includedServices = rows.services.filter(
        (s) => s.included !== false,
      );

      await AvailabilitySvc.reserve(tx, [
        ...includedAssets.map((a) => ({
          kind: "asset" as const,
          itemId: a.assetId,
          dateRange: rows.dateRange,
          quantity: a.quantity ?? 1,
        })),
        ...includedServices.map((s) => ({
          kind: "service" as const,
          itemId: s.serviceId,
          dateRange: rows.dateRange,
        })),
      ]);

      // Sequential, not Promise.all: an interactive transaction shares one
      // underlying connection, and concurrent queries against the same `tx`
      // are not safe to issue in parallel.
      const created: unknown[] = [];
      for (const data of rows.assets) {
        created.push(await tx.eventAssetTransaction.create({ data }));
      }
      for (const data of rows.services) {
        created.push(await tx.eventServiceTransaction.create({ data }));
      }
      for (const data of rows.venues) {
        created.push(await tx.eventVenueTransaction.create({ data }));
      }

      return created;
    });
  }
}
