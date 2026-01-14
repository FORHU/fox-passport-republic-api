import { prisma } from "../utils/prisma";
import { VenueStatus, VenueType } from "@prisma/client";

export default class VenueRepo {
    // READ ALL
    static async getAllVenues(filters?: {
        mayorId?: string;
        type?: VenueType;
        city?: string;
        status?: VenueStatus;
    }) {
        return prisma.venue.findMany({
            where: {
                ...(filters?.mayorId && { mayorId: filters.mayorId }),
                ...(filters?.type && { type: filters.type }),
                ...(filters?.city && { city: filters.city }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                images: true,
                mayor: {
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
                images: true,
                mayor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
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
        mayorId: string;
        name: string;
        description: string;
        type: VenueType;
        capacity: number;
        address: string;
        city: string;
        state?: string;
        country: string;
        latitude?: number;
        longitude?: number;
    }) {
        return prisma.venue.create({
            data: {
                mayorId: data.mayorId,
                name: data.name,
                description: data.description,
                type: data.type,
                capacity: data.capacity,
                address: data.address,
                city: data.city,
                state: data.state,
                country: data.country,
                latitude: data.latitude,
                longitude: data.longitude,
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
                images: true,
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
                mayorId: userId,
            },
        });
        return !!venue;
    }
}
