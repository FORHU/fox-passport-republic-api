import { prisma } from "../utils/prisma";
import { VenueStatus, BillingRate, VenueCategory } from "@prisma/client";

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
        ? filters?.status ? { status: filters.status } : {}
        : { status: filters?.status ?? VenueStatus.available }),
    };

    const [venues, total] = await prisma.$transaction([
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
}
