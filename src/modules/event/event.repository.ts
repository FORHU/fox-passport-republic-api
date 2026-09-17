import { Prisma } from "@prisma/client";
import { prisma, AppTransactionClient } from "../../utils/prisma";

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
   * with all of its partners attached, or it does not exist. Takes an
   * already-open `tx` rather than opening its own transaction: the caller
   * (BookingSvc) is where AvailabilitySvc.reserve runs — under its own row
   * lock, in the same transaction as these inserts — because a repository
   * (data access layer) isn't allowed to depend on a service; see the
   * layer-boundary check in tools/validate-architecture.mjs. Sequential, not
   * Promise.all: an interactive transaction shares one underlying
   * connection, and concurrent queries against the same `tx` are not safe
   * to issue in parallel.
   */
  static async createEscrowTransactions(
    tx: AppTransactionClient,
    rows: {
      assets: Prisma.EventAssetTransactionUncheckedCreateInput[];
      services: Prisma.EventServiceTransactionUncheckedCreateInput[];
      venues: Prisma.EventVenueTransactionUncheckedCreateInput[];
    },
  ) {
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
  }
}
