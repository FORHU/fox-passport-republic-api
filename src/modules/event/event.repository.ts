import { Prisma } from "@prisma/client";
import { prisma, AppTransactionClient } from "../../utils/prisma";

export interface PublicEventFilters {
  city?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  minCapacity?: number;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: "date_asc" | "date_desc" | "price_asc" | "price_desc";
  page: number;
  limit: number;
  now: Date;
}

export default class EventRepo {
  static async findPublicEvents(filters: PublicEventFilters) {
    const where: Prisma.EventWhereInput = {
      isPublic: true,
      requestStatus: "approved",
      eventStatus: { notIn: ["cancelled", "completed"] },
      startAt: {
        gte:
          filters.fromDate != null && filters.fromDate > filters.now
            ? filters.fromDate
            : filters.now,
        ...(filters.toDate ? { lt: filters.toDate } : {}),
      },
      ...(filters.city
        ? {
            targetCity: {
              contains: filters.city,
              mode: "insensitive",
            },
          }
        : {}),
      ...(filters.query
        ? {
            name: { contains: filters.query, mode: "insensitive" },
          }
        : {}),
      ...(filters.minPrice != null || filters.maxPrice != null
        ? {
            totalAmount: {
              ...(filters.minPrice != null ? { gte: filters.minPrice } : {}),
              ...(filters.maxPrice != null ? { lte: filters.maxPrice } : {}),
            },
          }
        : {}),
      ...(filters.minCapacity != null
        ? { guestCount: { gte: filters.minCapacity } }
        : {}),
    };
    const orderBy: Prisma.EventOrderByWithRelationInput[] =
      filters.sortBy === "date_desc"
        ? [{ startAt: "desc" }]
        : filters.sortBy === "price_asc"
          ? [{ totalAmount: "asc" }, { startAt: "asc" }]
          : filters.sortBy === "price_desc"
            ? [{ totalAmount: "desc" }, { startAt: "asc" }]
            : [{ startAt: "asc" }];
    const skip = (filters.page - 1) * filters.limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy,
        skip,
        take: filters.limit,
        select: {
          id: true,
          name: true,
          eventCategory: true,
          startAt: true,
          endAt: true,
          guestCount: true,
          totalAmount: true,
          targetCity: true,
          targetState: true,
          targetCountry: true,
          template: {
            select: {
              images: { take: 1, select: { url: true } },
            },
          },
        },
      }),
      prisma.event.count({ where }),
    ]);

    return { events, total };
  }

  static async setPublicVisibility(
    id: string,
    clientId: string,
    isPublic: boolean,
    now: Date,
  ) {
    const result = await prisma.event.updateMany({
      where: {
        id,
        clientId,
        ...(isPublic
          ? {
              requestStatus: "approved",
              eventStatus: { notIn: ["cancelled", "completed"] },
              startAt: { gt: now },
            }
          : {}),
      },
      data: { isPublic },
    });
    return result.count;
  }

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
          isPublic: true,
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
