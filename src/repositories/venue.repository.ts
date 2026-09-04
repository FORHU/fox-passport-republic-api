import { prisma } from "../utils/prisma";
import {
  VenueStatus,
  BillingRate,
  VenueCategory,
  Prisma,
} from "@prisma/client";

// Venues in these statuses hold their service area; drafts haven't committed
// to a boundary yet and archived/rejected ones are dead, so neither blocks
// an overlap check or shows up in a "near me" search.
const LIVE_STATUSES: VenueStatus[] = [
  VenueStatus.pending,
  VenueStatus.available,
];

const mayorSelect = {
  select: { id: true, name: true, email: true, imgId: true },
} as const;

export default class VenueRepo {
  static async createVenue(data: {
    mayorId: string;
    name: string;
    description: string;
    category: VenueCategory;
    capacity: number;
    address: string;
    city: string;
    state?: string;
    country: string;
    lat?: number;
    lng?: number;
    boundary?: Prisma.InputJsonValue;
    imgIds: string[];
    spaceType: string[];
    amenities: string[];
    techAv: string[];
    staffing: string[];
    policies: string[];
    status?: VenueStatus;
    price: number;
    billingRate: BillingRate;
  }) {
    const { imgIds, ...venueScalars } = data;
    return prisma.venue.create({
      data: {
        ...venueScalars,
        ...(imgIds &&
          imgIds.length > 0 && {
            images: { connect: imgIds.map((id) => ({ id })) },
          }),
      },
      include: { mayor: mayorSelect, images: true },
    });
  }

  static async findVenueById(id: string) {
    return prisma.venue.findUnique({
      where: { id },
      include: {
        images: true,
        mayor: {
          select: {
            id: true,
            name: true,
            email: true,
            imgId: true,
            createdAt: true,
          },
        },
      },
    });
  }

  // NOTE: `hostId` is accepted as a deprecated alias for `mayorId` so the frontend's
  // existing `?hostId=` query param keeps working unmodified during the transition
  // (Venues are created by Mayors, not Hosts — `hostId` was a naming holdover. See
  // CONTEXT.md "Mayor"). Remove the alias once the frontend is updated to send `mayorId`.
  static async findAllVenues(filters?: {
    mayorId?: string;
    hostId?: string;
    status?: VenueStatus;
    page?: number;
    limit?: number;
  }) {
    const mayorId = filters?.mayorId ?? filters?.hostId;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where = {
      ...(mayorId ? { mayorId } : {}),
      // Public browse (no mayorId) → only available venues by default
      // Mayor viewing own venues (with mayorId) → all statuses unless a specific status is passed
      ...(mayorId
        ? filters?.status
          ? { status: filters.status }
          : {}
        : { status: filters?.status ?? VenueStatus.available }),
    };

    // `Promise.all`, not `$transaction`: a list and its count need no
    // transactional isolation, and demanding one means waiting for a free
    // connection to *start* a transaction — which is what times out under a
    // burst with "Unable to start a transaction in the given time". The count
    // can now shift by one against a concurrent insert; a 500 on a browse page
    // is the worse trade.
    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { mayor: mayorSelect, images: true },
        skip,
        take: limit,
      }),
      prisma.venue.count({ where }),
    ]);

    return { venues, total };
  }

  static async findAllVenuesAdmin(filters?: {
    mayorId?: string;
    hostId?: string;
    status?: VenueStatus;
  }) {
    const mayorId = filters?.mayorId ?? filters?.hostId;
    return prisma.venue.findMany({
      where: {
        ...(mayorId ? { mayorId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { mayor: mayorSelect, images: true },
    });
  }

  static async findVenueByIdAndOwner(id: string, mayorId: string) {
    return prisma.venue.findFirst({
      where: { id: String(id), mayorId: String(mayorId) },
      include: { mayor: mayorSelect, images: true },
    });
  }

  static async findVenueByIdForAdmin(id: string) {
    return this.findVenueById(id);
  }

  static async updateVenue(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: VenueCategory;
      capacity: number;
      price: number;
      address: string;
      city: string;
      state?: string;
      country: string;
      lat: number;
      lng: number;
      boundary: Prisma.InputJsonValue;
      imgIds: string[];
      spaceType: string[];
      amenities: string[];
      techAv: string[];
      staffing: string[];
      policies: string[];
      status: VenueStatus;
      billingRate: BillingRate;
    }>,
  ) {
    const { imgIds, ...rest } = data;
    return prisma.venue.update({
      where: { id: String(id) },
      data: {
        ...rest,
        ...(imgIds !== undefined && {
          images: { set: imgIds.map((fid) => ({ id: fid })) },
        }),
      },
      include: { mayor: mayorSelect, images: true },
    });
  }

  static async archiveVenue(id: string) {
    return prisma.venue.update({
      where: { id: String(id) },
      data: { status: VenueStatus.archived },
    });
  }

  // Every live (pending or available) venue with a boundary — candidates for
  // an overlap check. `excludeId` skips the venue being updated so it
  // doesn't conflict with itself. No SQL prefilter: a polygon's extent isn't
  // a single indexable point, so this fetches all live venues and leaves the
  // exact intersection test to the caller. Fine at today's venue counts;
  // revisit (e.g. a stored bounding box, or PostGIS) if that stops being true.
  static async findLiveVenuesWithBoundary(excludeId?: string) {
    return prisma.venue.findMany({
      where: {
        status: { in: LIVE_STATUSES },
        boundary: { not: Prisma.JsonNull },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true, boundary: true },
    });
  }

  // Every live venue with a location, boundary or pin-only — for display as
  // a reference layer (e.g. "here's everywhere else already claimed" while
  // drawing a new one). Broader than findLiveVenuesWithBoundary, which is
  // boundary-only because it feeds the overlap *check* — a bare pin can't
  // geometrically overlap anything, but a host still benefits from seeing it.
  static async findLiveVenuesForReference(excludeId?: string) {
    return prisma.venue.findMany({
      where: {
        status: { in: LIVE_STATUSES },
        lat: { not: null },
        lng: { not: null },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        boundary: true,
        category: true,
        images: { take: 1, select: { url: true } },
      },
    });
  }

  // Available venues with a boundary — candidates for "which venues cover
  // this point" search. Same full-fetch-then-filter approach as above.
  static async findAvailableVenuesWithBoundary() {
    return prisma.venue.findMany({
      where: {
        status: VenueStatus.available,
        boundary: { not: Prisma.JsonNull },
      },
      include: { mayor: mayorSelect, images: true },
    });
  }
}
