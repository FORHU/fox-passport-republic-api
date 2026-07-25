import { prisma } from "../utils/prisma";
import { VenueStatus, BillingRate, VenueCategory } from "@prisma/client";

const ownerSelect = {
  select: { id: true, name: true, email: true, imgId: true },
} as const;

export default class VenueRepo {
  static async createVenue(data: {
    venueFoxerId: string;
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
      include: { venueFoxer: ownerSelect, images: true },
    });
  }

  static async findVenueById(id: string) {
    return prisma.venue.findUnique({
      where: { id },
      include: {
        images: true,
        venueFoxer: {
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

  // NOTE: `hostId` and `mayorId` are accepted as deprecated aliases for `venueFoxerId`
  // so existing query params keep working during the transition.
  static async findAllVenues(filters?: {
    venueFoxerId?: string;
    mayorId?: string;
    hostId?: string;
    status?: VenueStatus;
    page?: number;
    limit?: number;
  }) {
    const venueFoxerId = filters?.venueFoxerId ?? filters?.mayorId ?? filters?.hostId;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where = {
      ...(venueFoxerId ? { venueFoxerId } : {}),
      ...(venueFoxerId
        ? filters?.status ? { status: filters.status } : {}
        : { status: filters?.status ?? VenueStatus.available }),
    };

    const [venues, total] = await prisma.$transaction([
      prisma.venue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { venueFoxer: ownerSelect, images: true },
        skip,
        take: limit,
      }),
      prisma.venue.count({ where }),
    ]);

    return { venues, total };
  }

  static async findAllVenuesAdmin(filters?: {
    venueFoxerId?: string;
    mayorId?: string;
    hostId?: string;
    status?: VenueStatus;
  }) {
    const venueFoxerId = filters?.venueFoxerId ?? filters?.mayorId ?? filters?.hostId;
    return prisma.venue.findMany({
      where: {
        ...(venueFoxerId ? { venueFoxerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { venueFoxer: ownerSelect, images: true },
    });
  }

  static async findVenueByIdAndOwner(id: string, venueFoxerId: string) {
    return prisma.venue.findFirst({
      where: { id: String(id), venueFoxerId: String(venueFoxerId) },
      include: { venueFoxer: ownerSelect, images: true },
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
      include: { venueFoxer: ownerSelect, images: true },
    });
  }

  static async archiveVenue(id: string) {
    return prisma.venue.update({
      where: { id: String(id) },
      data: { status: VenueStatus.archived },
    });
  }
}
