import { prisma } from "../utils/prisma";
import { ListingStatus } from "@prisma/client";

export default class ListingRepo {
    // READ ALL with filters
    static async getAllListings(filters?: {
        hostId?: string;
        categoryId?: string;
        status?: ListingStatus;
        type?: any; // Using any for now to avoid strict type issues before re-gen
    }) {
        return prisma.listing.findMany({
            where: {
                ...(filters?.hostId && { hostId: filters.hostId }),
                ...(filters?.categoryId && { categoryId: filters.categoryId }),
                ...(filters?.status && { status: filters.status }),
                ...(filters?.type && { type: filters.type }),
            },
            select: {
                id: true,
                hostId: true,
                categoryId: true,
                title: true,
                description: true,
                propertyType: true,
                roomType: true,
                status: true,
                type: true,
                maxAttendees: true,
                createdAt: true,
                updatedAt: true,
                host: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        email: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                images: {
                    where: {
                        isThumbnail: true,
                    },
                    take: 1,
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // READ ONE by ID with full details
    static async getListingById(id: string) {
        return prisma.listing.findUnique({
            where: { id },
            include: {
                host: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        email: true,
                        profileImage: true,
                    },
                },
                category: true,
                location: true,
                pricing: true,
                availability: true,
                images: {
                    orderBy: {
                        orderIndex: "asc",
                    },
                },
                amenities: {
                    include: {
                        amenity: true
                    }
                },
                reviews: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                profileImage: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 10,
                },
            },
        });
    }

    // CREATE
    static async createListing(data: {
        hostId: string;
        categoryId?: string;
        title: string;
        description: string;
        propertyType?: string;
        roomType?: string;
        status: ListingStatus;
        type: any;
        maxAttendees?: number;
    }) {
        return prisma.listing.create({
            data: {
                hostId: data.hostId,
                categoryId: data.categoryId,
                title: data.title,
                description: data.description,
                propertyType: data.propertyType,
                roomType: data.roomType,
                status: data.status,
                type: data.type,
                maxAttendees: data.maxAttendees,
            },
            include: {
                host: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        email: true,
                    },
                },
                category: true,
            },
        });
    }

    // UPDATE
    static async updateListing(
        id: string,
        data: Partial<{
            categoryId: string;
            title: string;
            description: string;
            propertyType: string;
            roomType: string;
            status: ListingStatus;
            type: any;
            maxAttendees: number;
        }>
    ) {
        return prisma.listing.update({
            where: { id },
            data,
            include: {
                host: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        email: true,
                    },
                },
                category: true,
                location: true,
                pricing: true,
            },
        });
    }

    // DELETE
    static async deleteListing(id: string) {
        return prisma.listing.delete({
            where: { id },
        });
    }

    // CREATE LISTING LOCATION
    static async createListingLocation(data: {
        listingId: string;
        streetAddress: string;
        city: string;
        state?: string;
        country: string;
        latitude?: number;
        longitude?: number;
        requirements?: string;
        cancellationPolicy?: string;
    }) {
        return prisma.listingLocation.create({
            data: {
                listingId: data.listingId,
                streetAddress: data.streetAddress,
                city: data.city,
                state: data.state,
                country: data.country,
                latitude: data.latitude,
                longitude: data.longitude,
                requirements: data.requirements,
                cancellationPolicy: data.cancellationPolicy,
            },
        });
    }

    // UPDATE LISTING LOCATION
    static async updateListingLocation(
        listingId: string,
        data: Partial<{
            streetAddress: string;
            city: string;
            state: string;
            country: string;
            latitude: number;
            longitude: number;
            requirements: string;
            cancellationPolicy: string;
        }>
    ) {
        return prisma.listingLocation.update({
            where: { listingId },
            data,
        });
    }

    // CREATE LISTING PRICING
    static async createListingPricing(data: {
        listingId: string;
        basePrice: number;
        currency: string;
        serviceFeePercent: number;
        taxPercent: number;
        pricingTiers?: any;
    }) {
        return prisma.listingPricing.create({
            data: {
                listingId: data.listingId,
                basePrice: data.basePrice,
                currency: data.currency,
                serviceFeePercent: data.serviceFeePercent,
                taxPercent: data.taxPercent,
                pricingTiers: data.pricingTiers,
            },
        });
    }

    // ADD LISTING IMAGE
    static async addListingImage(data: {
        listingId: string;
        url: string;
        altText?: string;
        orderIndex?: number;
        isThumbnail?: boolean;
    }) {
        return prisma.listingImage.create({
            data: {
                listingId: data.listingId,
                url: data.url,
                altText: data.altText,
                orderIndex: data.orderIndex,
                isThumbnail: data.isThumbnail || false,
            },
        });
    }

    // Check if listing exists
    static async listingExists(id: string) {
        const listing = await prisma.listing.findUnique({
            where: { id },
            select: { id: true },
        });
        return !!listing;
    }

    // Check if user is host of listing
    static async isListingHost(listingId: string, userId: string) {
        const listing = await prisma.listing.findFirst({
            where: {
                id: listingId,
                hostId: userId,
            },
            select: { id: true },
        });
        return !!listing;
    }
}
