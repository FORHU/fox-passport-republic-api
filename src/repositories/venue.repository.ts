import { prisma } from "../utils/prisma";
import { VenueStatus, VenueType } from "@prisma/client";

export default class VenueRepo {
    // READ ALL
    static async getAllVenues(filters?: {
        hostId?: string;
        type?: VenueType;
        city?: string;
        status?: VenueStatus;
    }) {
        return prisma.venue.findMany({
            where: {
                ...(filters?.hostId && { hostId: filters.hostId }),
                ...(filters?.type && { type: filters.type }),
                ...(filters?.city && { city: filters.city }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                venueImages: true,
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // READ ONE
    static async getVenueById(id: string) {
        return prisma.venue.findUnique({
            where: { id },
            include: {
                venueImages: true,
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                events: {
                    where: {
                        status: "published",
                    },
                },
            },
        });
    }

    // CREATE
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
                state: data.state,
                country: data.country,
                status: VenueStatus.draft,
            },
        });
    }

    // UPDATE
    static async updateVenue(id: string, data: Partial<any>) {
        return prisma.venue.update({
            where: { id },
            data,
            include: {
                venueImages: true,
            },
        });
    }

    // DELETE
    static async deleteVenue(id: string) {
        return prisma.venue.delete({
            where: { id },
        });
    }

    // Add Image
    static async addImage(venueId: string, url: string, isThumbnail: boolean = false) {
        return prisma.venueImage.create({
            data: {
                venueId,
                url,
                isThumbnail,
            },
        });
    }

    // Verify Ownership
    static async isVenueOwner(venueId: string, userId: string) {
        const venue = await prisma.venue.findFirst({
            where: {
                id: venueId,
                hostId: userId,
            },
        });
        return !!venue;
    }
}
