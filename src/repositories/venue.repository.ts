import { prisma } from "../utils/prisma";
import { VenueStatus, VenueType, Prisma } from "@prisma/client";

export default class VenueRepo {

    // ───────────────────────────────────────────────────────────
    // CREATE
    // ───────────────────────────────────────────────────────────

    static async createVenue(data: {
        hostId: string;
        name: string;
        description: string;
        type: VenueType;
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
        images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
    }) {
        return prisma.venue.create({
            data: {
                hostId: data.hostId,
                name: data.name,
                description: data.description,
                type: data.type,
                capacity: data.capacity,
                address: data.address,
                city: data.city,
                state: data.state ?? undefined,
                country: data.country,
                spaceType: data.spaceType,
                amenities: data.amenities,
                techAv: data.techAv,
                staffing: data.staffing,
                policies: data.policies,
                status: data.status ?? undefined,
                price: data.price,
                venueImages: data.images?.length
                    ? {
                        create: data.images.map((img, index) => ({
                            url: img.url,
                            altText: img.altText ?? null,
                            orderIndex: img.orderIndex ?? index,
                            isThumbnail: img.isThumbnail ?? index === 0,
                        })),
                    }
                    : undefined,
            },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    // ───────────────────────────────────────────────────────────
    // READ — All query variations centralized here
    // ───────────────────────────────────────────────────────────

    /** Get single venue by ID with full details */
    static async findVenueById(id: string) {
        return prisma.venue.findUnique({
            where: { id },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    /** Get venues with optional filters (host, type, city, status) */
    static async findAllVenues(filters?: {
        hostId?: string;
        type?: VenueType;
        city?: string;
        status?: VenueStatus
    }) {
        return prisma.venue.findMany({
            where: {
                ...(filters?.status && { status: filters.status }),
                ...(filters?.hostId && { hostId: filters.hostId }),
                ...(filters?.type && { type: filters.type }),
                ...(filters?.city && { city: filters.city }),
            },
            include: {
                venueImages: { where: { isThumbnail: true }, take: 1 },
                host: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /** Check if venue exists */
    static async venueExists(id: string) {
        const count = await prisma.venue.count({ where: { id } });
        return count > 0;
    }

    /** Get venue with ownership check (returns null if not found/not owner) */
    static async findVenueByIdAndOwner(id: string, hostId: string) {
        return prisma.venue.findFirst({
            where: {
                id,
                hostId,
            },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    /** Get venue with admin override (bypass ownership, check existence only) */
    static async findVenueByIdForAdmin(id: string) {
        return prisma.venue.findUnique({
            where: { id },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    /** Get paginated venues with cursor-based pagination */
    static async findVenuesPaginated(params: {
        cursor?: string;
        limit?: number;
        filters?: {
            hostId?: string;
            type?: VenueType;
            city?: string;
            status?: VenueStatus;
            minPrice?: number;
            maxPrice?: number;
            minCapacity?: number;
            maxCapacity?: number;
        };
    }) {
        const { cursor, limit = 20, filters } = params;

        const where: Prisma.VenueWhereInput = {
            status: filters?.status ?? { not: VenueStatus.archived },
            ...(filters?.hostId && { hostId: filters.hostId }),
            ...(filters?.type && { type: filters.type }),
            ...(filters?.city && { city: { contains: filters.city, mode: 'insensitive' } }),
            ...(filters?.minPrice && { price: { gte: filters.minPrice } }),
            ...(filters?.maxPrice && { price: { lte: filters.maxPrice } }),
            ...(filters?.minCapacity && { capacity: { gte: filters.minCapacity } }),
            ...(filters?.maxCapacity && { capacity: { lte: filters.maxCapacity } }),
        };

        const venues = await prisma.venue.findMany({
            where,
            take: limit,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            include: {
                venueImages: { where: { isThumbnail: true }, take: 1 },
                host: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        const nextCursor = venues.length === limit ? venues[venues.length - 1].id : null;

        return { venues, nextCursor };
    }

    /** Search venues by name/description */
    static async searchVenues(query: string, filters?: { city?: string; type?: VenueType }) {
        return prisma.venue.findMany({
            where: {
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } },
                    { city: { contains: query, mode: 'insensitive' } },
                ],
                ...(filters?.city && { city: { contains: filters.city, mode: 'insensitive' } }),
                ...(filters?.type && { type: filters.type }),
            },
            include: {
                venueImages: { where: { isThumbnail: true }, take: 1 },
                host: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
    }

    /** Get venue statistics for a host */
    static async getHostVenueStats(hostId: string) {
        const [total, byStatus, byType] = await Promise.all([
            prisma.venue.count({ where: { hostId } }),
            prisma.venue.groupBy({
                by: ['status'],
                where: { hostId },
                _count: { status: true },
            }),
            prisma.venue.groupBy({
                by: ['type'],
                where: { hostId },
                _count: { type: true },
            }),
        ]);

        return { total, byStatus, byType };
    }

    // ───────────────────────────────────────────────────────────
    // UPDATE
    // ───────────────────────────────────────────────────────────

    static async updateVenue(
        id: string,
        data: Partial<{
            name: string;
            description: string;
            type: VenueType;
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
            images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
        }>
    ) {
        const imagesOps = data.images
            ? {
                deleteMany: {},
                create: data.images.map((img, idx) => ({
                    url: img.url,
                    altText: img.altText ?? null,
                    orderIndex: img.orderIndex ?? idx,
                    isThumbnail: img.isThumbnail ?? idx === 0,
                })),
            }
            : undefined;

        return prisma.venue.update({
            where: { id },
            data: {
                name: data.name ?? undefined,
                description: data.description ?? undefined,
                type: data.type ?? undefined,
                capacity: data.capacity ?? undefined,
                address: data.address ?? undefined,
                city: data.city ?? undefined,
                state: data.state ?? undefined,
                country: data.country ?? undefined,
                spaceType: data.spaceType ?? undefined,
                amenities: data.amenities ?? undefined,
                techAv: data.techAv ?? undefined,
                staffing: data.staffing ?? undefined,
                policies: data.policies ?? undefined,
                status: data.status ?? undefined,
                price: data.price,
                ...(imagesOps && { venueImages: imagesOps }),
            },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    /** Update with ownership verification built-in */
    static async updateVenueIfOwner(
        id: string,
        hostId: string,
        data: Parameters<typeof this.updateVenue>[1]
    ) {
        // First verify ownership
        const venue = await this.findVenueByIdAndOwner(id, hostId);
        if (!venue) return null;

        return this.updateVenue(id, data);
    }

    // ───────────────────────────────────────────────────────────
    // DELETE (Soft)
    // ───────────────────────────────────────────────────────────

    static async deleteVenue(id: string) {
        return prisma.venue.update({
            where: { id },
            data: { status: VenueStatus.archived }
        });
    }

    /** Delete with ownership verification */
    static async deleteVenueIfOwner(id: string, hostId: string) {
        const venue = await this.findVenueByIdAndOwner(id, hostId);
        if (!venue) return null;

        return this.deleteVenue(id);
    }

    // ───────────────────────────────────────────────────────────
    // OWNERSHIP & AUTHORIZATION QUERIES
    // ───────────────────────────────────────────────────────────

    static async isVenueOwner(venueId: string, hostId: string) {
        const venue = await prisma.venue.findUnique({
            where: { id: venueId },
            select: { hostId: true },
        });
        return venue?.hostId === hostId;
    }

    static async getVenueOwnerId(venueId: string) {
        const venue = await prisma.venue.findUnique({
            where: { id: venueId },
            select: { hostId: true },
        });
        return venue?.hostId ?? null;
    }

    // ───────────────────────────────────────────────────────────
    // IMAGE QUERIES (All image-related database operations)
    // ───────────────────────────────────────────────────────────

    static async addVenueImage(data: {
        venueId: string;
        url: string;
        isThumbnail?: boolean;
        altText?: string;
        orderIndex?: number
    }) {
        return prisma.venueImage.create({
            data: {
                venueId: data.venueId,
                url: data.url,
                isThumbnail: data.isThumbnail ?? false,
                altText: data.altText ?? null,
                orderIndex: data.orderIndex ?? 0,
            },
        });
    }

    static async findImageById(imageId: string) {
        return prisma.venueImage.findUnique({
            where: { id: imageId },
            include: { venue: { select: { hostId: true } } }
        });
    }

    static async findImagesByVenue(venueId: string) {
        return prisma.venueImage.findMany({
            where: { venueId },
            orderBy: { orderIndex: 'asc' },
        });
    }

    static async updateVenueImage(imageId: string, data: Partial<{
        url: string;
        altText: string;
        orderIndex: number;
        isThumbnail: boolean;
    }>) {
        return prisma.venueImage.update({
            where: { id: imageId },
            data: {
                url: data.url ?? undefined,
                altText: data.altText ?? undefined,
                orderIndex: data.orderIndex ?? undefined,
                isThumbnail: data.isThumbnail ?? undefined,
            },
        });
    }

    static async deleteVenueImage(imageId: string) {
        return prisma.venueImage.delete({
            where: { id: imageId },
        });
    }

    static async deleteAllVenueImages(venueId: string) {
        return prisma.venueImage.deleteMany({
            where: { venueId },
        });
    }

    static async setThumbnail(imageId: string, venueId: string) {
        // Transaction: unset all others, set this one
        return prisma.$transaction([
            prisma.venueImage.updateMany({
                where: { venueId },
                data: { isThumbnail: false },
            }),
            prisma.venueImage.update({
                where: { id: imageId },
                data: { isThumbnail: true },
            }),
        ]);
    }

    static async reorderImages(venueId: string, imageOrders: { id: string; orderIndex: number }[]) {
        return prisma.$transaction(
            imageOrders.map(({ id, orderIndex }) =>
                prisma.venueImage.update({
                    where: { id, venueId },
                    data: { orderIndex },
                })
            )
        );
    }
}