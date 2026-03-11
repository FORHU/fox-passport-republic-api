import { prisma } from "../utils/prisma";
import { VenueStatus, VenueType } from "@prisma/client";

export default class VenueRepo {

    // CREATE Venue Repository
    static async createVenue(data: {
        hostId: string;
        name: string;
        description: string;
        type: VenueType;
        capacity: number;
        address: string;
        city: string;
        state?: string;
        country: string;
        //latitude?: number;
        //longitude?: number;
        spaceType?: string[];
        amenities?: string[];
        techAv?: string[];
        staffing?: string[];
        policies?: string[];
        status?: VenueStatus;
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
                state: data.state ?? "",
                country: data.country,
                spaceType: data.spaceType ?? [],
                amenities: data.amenities ?? [],
                techAv: data.techAv ?? [],
                staffing: data.staffing ?? [],
                policies: data.policies ?? [],
                status: data.status ?? VenueStatus.draft,
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

    // READ Venue by ID Repository
    static async findVenueById(id: string) {
        return prisma.venue.findUnique({
            where: { id },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    // READ Venues Repository with optional filters for hostId, type, city, and status
    static async findAllVenues(filters?: { hostId?: string; type?: VenueType; city?: string; status?: VenueStatus }) {
        return prisma.venue.findMany({
            where: {
                deletedAt: null, // Exclude soft-deleted venues
                ...(filters?.hostId && { hostId: filters.hostId }),
                ...(filters?.type && { type: filters.type }),
                ...(filters?.city && { city: filters.city }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                venueImages: { where: { isThumbnail: true }, take: 1 },
                host: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    // UPDATE Venue Repository 
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
            //latitude?: number;
            //longitude?: number;
            spaceType?: string[];
            amenities?: string[];
            techAv?: string[];
            staffing?: string[];
            policies?: string[];
            status?: VenueStatus;
            images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
        }>
    ) {
        // if images are provided we will replace all existing ones
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
                spaceType: data.spaceType ?? undefined,
                amenities: data.amenities ?? undefined,
                techAv: data.techAv ?? undefined,
                staffing: data.staffing ?? undefined,
                policies: data.policies ?? undefined,
                status: data.status ?? undefined,
                ...(imagesOps && { venueImages: imagesOps }),
            },
            include: {
                venueImages: true,
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    // DELETE Venue Repository (Soft delete)
    static async deleteVenue(id: string) {
        return prisma.venue.update({
            where: { id },
            data: { deletedAt: new Date() }
        });
    }

    // CHECK OWNERSHIP
    static async isVenueOwner(venueId: string, hostId: string) {
        const venue = await prisma.venue.findUnique({
            where: { id: venueId },
            select: { hostId: true },
        });
        return venue?.hostId === hostId;
    }

    // IMAGE REPOSITORY METHODS
    static async addVenueImage(data: { venueId: string; url: string; isThumbnail?: boolean; altText?: string; orderIndex?: number }) {
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

    static async updateVenueImage(imageId: string, data: any) {
        return prisma.venueImage.update({
            where: { id: imageId },
            data,
        });
    }

    static async deleteVenueImage(imageId: string) {
        return prisma.venueImage.delete({
            where: { id: imageId },
        });
    }

    static async findImageById(imageId: string) {
        return prisma.venueImage.findUnique({
            where: { id: imageId },
            include: { venue: { select: { hostId: true } } }
        });
    }
}