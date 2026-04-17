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
    state?: string | null;
    country: string;
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
      include: { host: { select: { id: true, name: true, email: true } }, files: true },
    });
  }

  static async findVenueById(id: string) {
    return prisma.venue.findUnique({
      where: { id: String(id) },
      include: { host: { select: { id: true, name: true, email: true } }, files: true },
    });
  }

  static async findAllVenues(filters?: { hostId?: string; category?: string; city?: string; status?: VenueStatus }) {
    return prisma.venue.findMany({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.hostId && { hostId: String(filters.hostId) }),
        ...(filters?.category && { category: filters.category }),
        ...(filters?.city && { city: filters.city }),
      },
      include: { host: { select: { id: true, name: true } }, files: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findVenueByIdAndOwner(id: string, hostId: string) {
    return prisma.venue.findFirst({
      where: { id: String(id), hostId: String(hostId) },
      include: { host: { select: { id: true, name: true, email: true } }, files: true },
    });
  }

  static async findVenueByIdForAdmin(id: string) {
    return this.findVenueById(id);
  }

  static async searchVenues(query: string, filters?: { city?: string; category?: string }) {
    return prisma.venue.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
        ],
        ...(filters?.city && { city: { contains: filters.city, mode: "insensitive" } }),
        ...(filters?.category && { category: filters.category }),
      },
      include: { host: { select: { id: true, name: true } }, files: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  static async getHostVenueStats(hostId: string) {
    const [total, byStatus, byType] = await Promise.all([
      prisma.venue.count({ where: { hostId: String(hostId) } }),
      prisma.venue.groupBy({ by: ["status"], where: { hostId: String(hostId) }, _count: { status: true } }),
      prisma.venue.groupBy({ by: ["category"], where: { hostId: String(hostId) }, _count: { category: true } }),
    ]);
    return { total, byStatus, byType };
  }

  static async updateVenue(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: string;
      capacity: number;
      address: string;
      city: string;
      state?: string;
      country: string;
      spaceType?: string[];
      amenities?: string[];
      techAv?: string[];
      staffing?: string[];
      policies?: string[];
      status?: VenueStatus;
      price?: number;
    }>
  ) {
    return prisma.venue.update({
      where: { id: String(id) },
      data,
      include: { host: { select: { id: true, name: true, email: true } }, files: true },
    });
  }

  static async deleteVenue(id: string) {
    return prisma.venue.update({
      where: { id: String(id) },
      data: { status: VenueStatus.archived },
    });
  }
}
