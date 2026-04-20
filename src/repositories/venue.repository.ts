import { prisma } from "../utils/prisma";
import { VenueStatus } from "@prisma/client";

const hostSelect = { select: { id: true, name: true, email: true } } as const;

export default class VenueRepo {
  static async createVenue(data: {
    hostId: string;
    name: string;
    description: string;
    category: string;
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
  }) {
    const { imgIds, ...venueScalars } = data;
    return prisma.venue.create({
      data: {
        ...venueScalars,
        images: {
          connect: imgIds.map((id) => ({ id })),
        },
      },
      include: { host: hostSelect, images: true },
    });
  }

  static async findVenueById(id: string) {
    return prisma.venue.findUnique({
      where: { id },
      include: { images: true },
    });
  }

  static async findAllVenues() {
    return prisma.venue.findMany({
      orderBy: { createdAt: "desc" },
      include: { images: true },
    });
  }

  static async findVenueByIdAndOwner(id: string, hostId: string) {
    return prisma.venue.findFirst({
      where: { id: String(id), hostId: String(hostId) },
      include: { host: hostSelect, images: true },
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
      category: string;
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
    }>
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
      include: { host: hostSelect, images: true },
    });
  }

  static async archiveVenue(id: string) {
    return prisma.venue.update({
      where: { id: String(id) },
      data: { status: VenueStatus.archived },
    });
  }
}
