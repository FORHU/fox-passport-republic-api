import { prisma } from "../utils/prisma";
import { VenueStatus } from "@prisma/client";

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
    return prisma.venue.create({
      data,
      include: { host: { select: { id: true, name: true, email: true } } },
    });
  }

  static async findVenueById(id: string) {
    const venue = await prisma.venue.findUnique({
      where: { id },
    });
  
    if (!venue) return null;
  
    const files = await prisma.file.findMany({
      where: {
        id: { in: venue.imgIds || [] },
      },
    });
  
    return {
      ...venue,
      images: files,
    };
  }

  static async findAllVenues() {
    const venues = await prisma.venue.findMany({
      orderBy: { createdAt: "desc" },
    });

    const venuesWithImages = await Promise.all(
      venues.map(async (venue) => {
        const files = await prisma.file.findMany({
          where: {
            id: { in: venue.imgIds || [] },
          },
        });
  
        return {
          ...venue,
          images: files,
        };
      })
    );
    return venuesWithImages;
  }

  static async findVenueByIdAndOwner(id: string, hostId: string) {
    return prisma.venue.findFirst({
      where: { id: String(id), hostId: String(hostId) },
      include: { host: { select: { id: true, name: true, email: true } } },
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
    return prisma.venue.update({
      where: { id: String(id) },
      data,
      include: { host: { select: { id: true, name: true, email: true } } },
    });
  }

  static async archiveVenue(id: string) {
    return prisma.venue.update({
      where: { id: String(id) },
      data: { status: VenueStatus.archived },
    });
  }
}
