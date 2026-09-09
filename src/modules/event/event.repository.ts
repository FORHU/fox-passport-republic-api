import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

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
   * `$transaction` rather than the `Promise.all` the controller used. That
   * version could leave a booking holding some of its escrow rows and no record
   * that the rest were meant to be there - which nothing downstream checks for,
   * because a partner that is simply absent looks exactly like a partner that
   * was never included.
   */
  static async createEscrowTransactions(rows: {
    assets: Prisma.EventAssetTransactionUncheckedCreateInput[];
    services: Prisma.EventServiceTransactionUncheckedCreateInput[];
    venues: Prisma.EventVenueTransactionUncheckedCreateInput[];
  }) {
    return prisma.$transaction([
      ...rows.assets.map((data) =>
        prisma.eventAssetTransaction.create({ data }),
      ),
      ...rows.services.map((data) =>
        prisma.eventServiceTransaction.create({ data }),
      ),
      ...rows.venues.map((data) =>
        prisma.eventVenueTransaction.create({ data }),
      ),
    ]);
  }
}
