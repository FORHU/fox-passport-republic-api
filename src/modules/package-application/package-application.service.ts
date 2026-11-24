import {
  AssetStatus,
  EventCategory,
  EventTemplateStatus,
  MatchDeclineReason,
  MatchRequestStatus,
  PackageApplicationStatus,
  PackageLineKind,
  Prisma,
  ServiceStatus,
  VenueStatus,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors";
import { eventTemplateCache } from "../../utils/cache-namespaces";
import NotificationService from "../notifications/user-notification.service";
import EventTemplateSvc from "../event-template/event-template.service";

/**
 * Open packages and applications (api#460).
 *
 * A package being built (`draft`, shown as Open) is visible to Event, Venue
 * and Provider users, never to citizens. A Mayor or Provider applies with one
 * of their listings for a spot; the Event Foxer accepts (the listing joins as
 * an accepted line) or declines with a reason.
 *
 * A **spot** is `venue` (one per package) or `<kind>:<category>` for gear and
 * services (one per category). A line that is waiting or accepted takes its
 * spot; a declined or removed one frees it.
 */

export type SpotKey = string;

/** The spot a listing of this kind and category fills. */
export const spotKey = (kind: PackageLineKind, category?: string | null) =>
  kind === PackageLineKind.venue ? "venue" : `${kind}:${category ?? "other"}`;

const MESSAGE_MAX = 500;

/** The lines of a package, with what the spot rule needs from each. */
const linesInclude = {
  templateVenues: {
    select: {
      venueId: true,
      matchRequestStatus: true,
      isOptional: true,
      venue: { select: { name: true } },
    },
  },
  templateAssets: {
    select: {
      assetId: true,
      matchRequestStatus: true,
      isOptional: true,
      asset: { select: { name: true, category: true } },
    },
  },
  templateServices: {
    select: {
      serviceId: true,
      matchRequestStatus: true,
      isOptional: true,
      service: { select: { name: true, category: true } },
    },
  },
} satisfies Prisma.EventTemplateInclude;

type WithLines = Prisma.EventTemplateGetPayload<{
  include: typeof linesInclude;
}>;

export interface PackageLineView {
  kind: PackageLineKind;
  listingId: string;
  name: string;
  spot: SpotKey;
  status: MatchRequestStatus;
  isOptional: boolean;
}

/** Every listing line of a package, as the spot rule sees it. */
export function linesOf(t: WithLines): PackageLineView[] {
  const lines: PackageLineView[] = [];
  for (const l of t.templateVenues) {
    if (!l.venueId) continue;
    lines.push({
      kind: PackageLineKind.venue,
      listingId: l.venueId,
      name: l.venue?.name ?? "",
      spot: spotKey(PackageLineKind.venue),
      status: l.matchRequestStatus,
      isOptional: l.isOptional,
    });
  }
  for (const l of t.templateAssets) {
    if (!l.assetId) continue;
    lines.push({
      kind: PackageLineKind.asset,
      listingId: l.assetId,
      name: l.asset?.name ?? "",
      spot: spotKey(PackageLineKind.asset, l.asset?.category),
      status: l.matchRequestStatus,
      isOptional: l.isOptional,
    });
  }
  for (const l of t.templateServices) {
    if (!l.serviceId) continue;
    lines.push({
      kind: PackageLineKind.service,
      listingId: l.serviceId,
      name: l.service?.name ?? "",
      spot: spotKey(PackageLineKind.service, l.service?.category),
      status: l.matchRequestStatus,
      isOptional: l.isOptional,
    });
  }
  return lines;
}

/**
 * A line that holds its spot: waiting or accepted. Declined and expired
 * (api#462) lines free it.
 */
const isOpenAnswer = (s: MatchRequestStatus) =>
  s !== MatchRequestStatus.declined && s !== MatchRequestStatus.expired;

/** The spots taken by a waiting or accepted line. */
export function takenSpots(lines: PackageLineView[]): Set<SpotKey> {
  return new Set(
    lines.filter((l) => isOpenAnswer(l.status)).map((l) => l.spot),
  );
}

interface Listing {
  kind: PackageLineKind;
  id: string;
  name: string;
  ownerId: string;
  live: boolean;
  spot: SpotKey;
  price: number;
}

/** A listing by kind and id, with who owns it and the spot it fills. */
async function findListing(
  kind: PackageLineKind,
  id: string,
): Promise<Listing | null> {
  if (kind === PackageLineKind.venue) {
    const v = await prisma.venue.findUnique({
      where: { id },
      select: { name: true, mayorId: true, status: true, price: true },
    });
    return (
      v && {
        kind,
        id,
        name: v.name,
        ownerId: v.mayorId,
        live: v.status === VenueStatus.available,
        spot: spotKey(kind),
        price: v.price.toNumber(),
      }
    );
  }
  if (kind === PackageLineKind.asset) {
    const a = await prisma.asset.findUnique({
      where: { id },
      select: {
        name: true,
        ownerId: true,
        status: true,
        category: true,
        price: true,
      },
    });
    return (
      a && {
        kind,
        id,
        name: a.name,
        ownerId: a.ownerId,
        live:
          a.status === AssetStatus.available ||
          a.status === AssetStatus.reserved,
        spot: spotKey(kind, a.category),
        price: a.price.toNumber(),
      }
    );
  }
  const s = await prisma.service.findUnique({
    where: { id },
    select: {
      name: true,
      ownerId: true,
      status: true,
      category: true,
      price: true,
    },
  });
  return (
    s && {
      kind,
      id,
      name: s.name,
      ownerId: s.ownerId,
      live: s.status === ServiceStatus.available,
      spot: spotKey(kind, s.category),
      price: s.price.toNumber(),
    }
  );
}

/** Every live venue, gear and service this person could apply with. */
async function liveListingsOf(userId: string): Promise<Listing[]> {
  const [venues, assets, services] = await Promise.all([
    prisma.venue.findMany({
      where: { mayorId: userId, status: VenueStatus.available },
      select: { id: true, name: true, price: true },
    }),
    prisma.asset.findMany({
      where: {
        ownerId: userId,
        status: { in: [AssetStatus.available, AssetStatus.reserved] },
      },
      select: { id: true, name: true, category: true, price: true },
    }),
    prisma.service.findMany({
      where: { ownerId: userId, status: ServiceStatus.available },
      select: { id: true, name: true, category: true, price: true },
    }),
  ]);
  const of = (
    kind: PackageLineKind,
    r: { id: string; name: string; price: Prisma.Decimal; category?: string },
  ): Listing => ({
    kind,
    id: r.id,
    name: r.name,
    ownerId: userId,
    live: true,
    spot: spotKey(kind, r.category),
    price: r.price.toNumber(),
  });
  return [
    ...venues.map((v) => of(PackageLineKind.venue, v)),
    ...assets.map((a) => of(PackageLineKind.asset, a)),
    ...services.map((s) => of(PackageLineKind.service, s)),
  ];
}

/** An open package someone else is building, or not found. */
async function openPackageFor(userId: string, templateId: string) {
  const t = await prisma.eventTemplate.findUnique({
    where: { id: templateId },
    include: {
      ...linesInclude,
      owner: { select: { id: true, name: true } },
    },
  });
  if (!t || t.status !== EventTemplateStatus.draft) {
    throw notFound("Open package");
  }
  if (t.ownerId === userId) {
    throw badRequest("This is your own package");
  }
  return t;
}

async function ownPackage(ownerId: string, templateId: string) {
  const t = await prisma.eventTemplate.findUnique({
    where: { id: templateId },
    include: linesInclude,
  });
  if (!t) throw notFound("Package");
  if (t.ownerId !== ownerId) {
    throw forbidden("Only the package's Event Foxer can do this");
  }
  return t;
}

export default class PackageApplicationSvc {
  /**
   * Packages being built by other Event Foxers, newest first, with the spots
   * already taken and the caller's own applications to each.
   */
  static async listOpen(
    userId: string,
    filters: {
      category?: EventCategory;
      city?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
    const where: Prisma.EventTemplateWhereInput = {
      status: EventTemplateStatus.draft,
      ownerId: { not: userId },
      ...(filters.category && { category: filters.category }),
      ...(filters.city && {
        targetCity: { contains: filters.city, mode: "insensitive" },
      }),
    };
    const [templates, total] = await Promise.all([
      prisma.eventTemplate.findMany({
        where,
        include: {
          ...linesInclude,
          owner: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.eventTemplate.count({ where }),
    ]);
    const mine = await prisma.packageApplication.findMany({
      where: {
        applicantId: userId,
        templateId: { in: templates.map((t) => t.id) },
      },
      select: {
        id: true,
        templateId: true,
        kind: true,
        listingId: true,
        status: true,
      },
    });
    return {
      packages: templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        targetCity: t.targetCity,
        targetState: t.targetState,
        maxAttendees: t.maxAttendees,
        owner: t.owner,
        takenSpots: [...takenSpots(linesOf(t))],
        myApplications: mine.filter((a) => a.templateId === t.id),
      })),
      total,
      page,
      limit,
    };
  }

  /** One open package: its lines (as spots) and the caller's applications. */
  static async getOpen(userId: string, templateId: string) {
    const t = await openPackageFor(userId, templateId);
    const lines = linesOf(t).filter((l) => isOpenAnswer(l.status));
    const mine = await prisma.packageApplication.findMany({
      where: { applicantId: userId, templateId },
      select: {
        id: true,
        kind: true,
        listingId: true,
        status: true,
        declineReason: true,
        declineNote: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const taken = takenSpots(lines);
    const waiting = new Set(
      mine
        .filter((a) => a.status === PackageApplicationStatus.pending)
        .map((a) => a.listingId),
    );
    // The caller's own live listings, and whether each can apply: its spot
    // is free and it has no waiting application here. The apps show these
    // as the choices, so the spot rule is decided here only.
    const myListings = (await liveListingsOf(userId)).map((l) => ({
      kind: l.kind,
      id: l.id,
      name: l.name,
      price: l.price,
      spot: l.spot,
      canApply: !taken.has(l.spot) && !waiting.has(l.id),
      why: taken.has(l.spot)
        ? ("spot_taken" as const)
        : waiting.has(l.id)
          ? ("already_applied" as const)
          : null,
    }));
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      targetCity: t.targetCity,
      targetState: t.targetState,
      maxAttendees: t.maxAttendees,
      owner: t.owner,
      lines,
      takenSpots: [...taken],
      myApplications: mine,
      myListings,
    };
  }

  /**
   * A Mayor or Provider applies with one of their live listings for a spot
   * the package doesn't have yet. One waiting application per listing.
   */
  static async apply(
    userId: string,
    templateId: string,
    input: { kind: PackageLineKind; listingId: string; message?: string },
  ) {
    const t = await openPackageFor(userId, templateId);
    const listing = await findListing(input.kind, input.listingId);
    if (!listing) throw notFound("Listing");
    if (listing.ownerId !== userId) {
      throw forbidden("You can only apply with your own listing");
    }
    if (!listing.live) {
      throw badRequest("Publish this listing before applying with it");
    }
    if (takenSpots(linesOf(t)).has(listing.spot)) {
      throw conflict("This package already has one of these");
    }
    const waiting = await prisma.packageApplication.findFirst({
      where: {
        templateId,
        listingId: listing.id,
        status: PackageApplicationStatus.pending,
      },
      select: { id: true },
    });
    if (waiting) throw conflict("You've already applied with this listing");

    const message = input.message?.trim().slice(0, MESSAGE_MAX) || null;
    const application = await prisma.packageApplication.create({
      data: {
        templateId,
        applicantId: userId,
        kind: listing.kind,
        listingId: listing.id,
        message,
      },
    });
    await NotificationService.create({
      userId: t.ownerId,
      type: "PACKAGE_APPLICATION",
      title: "New application",
      message: `${listing.name} applied to join ${t.name}.`,
      metadata: { templateId, applicationId: application.id },
    }).catch((e) =>
      console.error(`Failed to notify application ${application.id}`, e),
    );
    return application;
  }

  /** The applicant takes back an application that is still waiting. */
  static async withdraw(
    userId: string,
    templateId: string,
    applicationId: string,
  ) {
    const { count } = await prisma.packageApplication.updateMany({
      where: {
        id: applicationId,
        templateId,
        applicantId: userId,
        status: PackageApplicationStatus.pending,
      },
      data: {
        status: PackageApplicationStatus.withdrawn,
        respondedAt: new Date(),
      },
    });
    if (count === 0) throw notFound("Waiting application");
    return { id: applicationId, status: PackageApplicationStatus.withdrawn };
  }

  /** The package's applications, waiting first, with each listing's name and price. */
  static async listForOwner(ownerId: string, templateId: string) {
    const t = await ownPackage(ownerId, templateId);
    const rows = await prisma.packageApplication.findMany({
      where: { templateId },
      include: { applicant: { select: { id: true, name: true, imgId: true } } },
      orderBy: { createdAt: "desc" },
    });
    const listings = await Promise.all(
      rows.map((r) => findListing(r.kind, r.listingId)),
    );
    const taken = takenSpots(linesOf(t));
    const order = (s: PackageApplicationStatus) =>
      s === PackageApplicationStatus.pending ? 0 : 1;
    return rows
      .map((r, i) => ({
        id: r.id,
        kind: r.kind,
        listingId: r.listingId,
        listingName: listings[i]?.name ?? null,
        price: listings[i]?.price ?? null,
        spot: listings[i]?.spot ?? null,
        spotTaken: listings[i] ? taken.has(listings[i]!.spot) : false,
        message: r.message,
        status: r.status,
        declineReason: r.declineReason,
        declineNote: r.declineNote,
        applicant: r.applicant,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => order(a.status) - order(b.status));
  }

  /**
   * The Event Foxer answers an application. Accepting adds the listing as an
   * accepted line (the applicant already said yes) and declines the other
   * waiting applications for that spot; declining needs a reason.
   */
  static async answer(
    ownerId: string,
    templateId: string,
    applicationId: string,
    input: {
      status: "accepted" | "declined";
      reason?: MatchDeclineReason;
      note?: string;
    },
  ) {
    const t = await ownPackage(ownerId, templateId);
    const app = await prisma.packageApplication.findFirst({
      where: { id: applicationId, templateId },
    });
    if (!app) throw notFound("Application");
    if (app.status !== PackageApplicationStatus.pending) {
      throw conflict("This application was already answered");
    }

    if (input.status === "declined") {
      const note = input.note?.trim() || null;
      if (!input.reason) throw badRequest("Choose why you're declining");
      if (input.reason === MatchDeclineReason.other && !note) {
        throw badRequest("Add a note when the reason is Other");
      }
      await this.close(
        app.id,
        PackageApplicationStatus.declined,
        input.reason,
        note,
      );
      await this.tell(app.applicantId, templateId, t.name, false);
      return { id: app.id, status: PackageApplicationStatus.declined };
    }

    const listing = await findListing(app.kind, app.listingId);
    if (!listing || !listing.live) {
      throw badRequest("This listing isn't available any more");
    }
    if (takenSpots(linesOf(t)).has(listing.spot)) {
      throw conflict("This package already has one of these");
    }
    // Claim it first, so two answers at once can't both add a line.
    const claimed = await prisma.packageApplication.updateMany({
      where: { id: app.id, status: PackageApplicationStatus.pending },
      data: {
        status: PackageApplicationStatus.accepted,
        respondedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw conflict("This application was already answered");
    }
    try {
      await this.addAcceptedLine(templateId, ownerId, listing);
    } catch (e) {
      await prisma.packageApplication.update({
        where: { id: app.id },
        data: { status: PackageApplicationStatus.pending, respondedAt: null },
      });
      throw e;
    }
    await this.tell(app.applicantId, templateId, t.name, true);

    // The spot is filled: the others waiting for it are told.
    const others = await prisma.packageApplication.findMany({
      where: {
        templateId,
        status: PackageApplicationStatus.pending,
        id: { not: app.id },
        kind: app.kind,
      },
    });
    for (const o of others) {
      const l = await findListing(o.kind, o.listingId);
      if (l?.spot !== listing.spot) continue;
      await this.close(
        o.id,
        PackageApplicationStatus.declined,
        MatchDeclineReason.other,
        "Spot filled",
      );
      await this.tell(o.applicantId, templateId, t.name, false);
    }
    await eventTemplateCache.invalidateAll();
    return { id: app.id, status: PackageApplicationStatus.accepted };
  }

  /** Adds the listing through the usual attach, then marks it accepted. */
  private static async addAcceptedLine(
    templateId: string,
    ownerId: string,
    listing: Listing,
  ) {
    const agreed = {
      matched: true,
      matchRequestStatus: MatchRequestStatus.accepted,
      respondedAt: new Date(),
    };
    if (listing.kind === PackageLineKind.venue) {
      const line = await EventTemplateSvc.attachVenue(
        templateId,
        ownerId,
        listing.id,
      );
      await prisma.eventTemplateVenue.update({
        where: { id: line.id },
        data: agreed,
      });
    } else if (listing.kind === PackageLineKind.asset) {
      const line = await EventTemplateSvc.attachAsset(
        templateId,
        ownerId,
        listing.id,
      );
      await prisma.eventTemplateAsset.update({
        where: { id: line.id },
        data: agreed,
      });
    } else {
      const line = await EventTemplateSvc.attachService(
        templateId,
        ownerId,
        listing.id,
      );
      await prisma.eventTemplateService.update({
        where: { id: line.id },
        data: agreed,
      });
    }
  }

  private static async close(
    id: string,
    status: PackageApplicationStatus,
    reason: MatchDeclineReason,
    note: string | null,
  ) {
    const { count } = await prisma.packageApplication.updateMany({
      where: { id, status: PackageApplicationStatus.pending },
      data: {
        status,
        declineReason: reason,
        declineNote: note,
        respondedAt: new Date(),
      },
    });
    if (count === 0) throw conflict("This application was already answered");
  }

  private static async tell(
    userId: string,
    templateId: string,
    packageName: string,
    accepted: boolean,
  ) {
    await NotificationService.create({
      userId,
      type: "PACKAGE_APPLICATION_ANSWERED",
      title: accepted ? "You're in the package" : "Application not accepted",
      message: accepted
        ? `You joined ${packageName}.`
        : `Your application to ${packageName} wasn't accepted.`,
      metadata: { templateId, accepted },
    }).catch((e) => console.error("Failed to notify an applicant", e));
  }
}
