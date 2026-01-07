import ListingRepo from "../repositories/listing.repository";
import { ListingStatus } from "@prisma/client";

export default class ListingSvc {
    // GET ALL LISTINGS
    static async getAllListings(filters?: {
        hostId?: string;
        categoryId?: string;
        status?: ListingStatus;
        type?: any;
    }) {
        return ListingRepo.getAllListings(filters);
    }

    // GET LISTING BY ID
    static async getListingById(id: string) {
        const listing = await ListingRepo.getListingById(id);
        if (!listing) {
            throw new Error("Listing not found");
        }
        return listing;
    }

    // CREATE LISTING (Basic listing creation)
    static async createListing(data: {
        hostId: string;
        categoryId?: string;
        title: string;
        description: string;
        propertyType?: string;
        roomType?: string;
        status?: ListingStatus;
        type?: any;
        maxAttendees?: number;
    }) {
        // Validate required fields
        if (!data.title || !data.description) {
            throw new Error("Title and description are required");
        }

        return ListingRepo.createListing({
            hostId: data.hostId,
            categoryId: data.categoryId,
            title: data.title,
            description: data.description,
            propertyType: data.propertyType,
            roomType: data.roomType,
            status: data.status || ListingStatus.draft,
            type: data.type || "venue",
            maxAttendees: data.maxAttendees,
        });
    }

    // CREATE COMPLETE LISTING (with details, pricing, and images)
    static async createCompleteListing(data: {
        hostId: string;
        categoryId?: string;
        title: string;
        description: string;
        propertyType?: string;
        roomType?: string;
        status?: ListingStatus;
        type?: any;
        maxAttendees?: number;
        location?: {
            streetAddress: string;
            city: string;
            state?: string;
            country: string;
            latitude?: number;
            longitude?: number;
            requirements?: string;
            cancellationPolicy?: string;
        };
        pricing?: {
            basePrice: number;
            currency: string;
            serviceFeePercent?: number;
            taxPercent?: number;
            pricingTiers?: any;
        };
        images?: Array<{
            url: string;
            altText?: string;
            orderIndex?: number;
            isThumbnail?: boolean;
        }>;
    }) {
        // Create the listing first
        const listing = await this.createListing({
            hostId: data.hostId,
            categoryId: data.categoryId,
            title: data.title,
            description: data.description,
            propertyType: data.propertyType,
            roomType: data.roomType,
            status: data.status,
            type: data.type,
            maxAttendees: data.maxAttendees,
        });

        // Add location if provided
        if (data.location) {
            await ListingRepo.createListingLocation({
                listingId: listing.id,
                ...data.location,
            });
        }

        // Add pricing if provided
        if (data.pricing) {
            await ListingRepo.createListingPricing({
                listingId: listing.id,
                basePrice: data.pricing.basePrice,
                currency: data.pricing.currency || "USD",
                serviceFeePercent: data.pricing.serviceFeePercent || 0,
                taxPercent: data.pricing.taxPercent || 0,
                pricingTiers: data.pricing.pricingTiers,
            });
        }

        // Add images if provided
        if (data.images && data.images.length > 0) {
            for (const image of data.images) {
                await ListingRepo.addListingImage({
                    listingId: listing.id,
                    url: image.url,
                    altText: image.altText,
                    orderIndex: image.orderIndex,
                    isThumbnail: image.isThumbnail,
                });
            }
        }

        // Return the complete listing
        return ListingRepo.getListingById(listing.id);
    }

    // UPDATE LISTING
    static async updateListing(
        id: string,
        userId: string,
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
        // Check if listing exists
        const exists = await ListingRepo.listingExists(id);
        if (!exists) {
            throw new Error("Listing not found");
        }

        // Check if user is the host (authorization)
        const isHost = await ListingRepo.isListingHost(id, userId);
        if (!isHost) {
            throw new Error("Unauthorized: You can only update your own listings");
        }

        return ListingRepo.updateListing(id, data);
    }

    // UPDATE LISTING LOCATION
    static async updateListingLocation(
        listingId: string,
        userId: string,
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
        // Check if user is the host
        const isHost = await ListingRepo.isListingHost(listingId, userId);
        if (!isHost) {
            throw new Error("Unauthorized: You can only update your own listings");
        }

        return ListingRepo.updateListingLocation(listingId, data);
    }

    // DELETE LISTING
    static async deleteListing(id: string, userId: string) {
        // Check if listing exists
        const exists = await ListingRepo.listingExists(id);
        if (!exists) {
            throw new Error("Listing not found");
        }

        // Check if user is the host (authorization)
        const isHost = await ListingRepo.isListingHost(id, userId);
        if (!isHost) {
            throw new Error("Unauthorized: You can only delete your own listings");
        }

        return ListingRepo.deleteListing(id);
    }

    // ADD LISTING IMAGE
    static async addListingImage(
        listingId: string,
        userId: string,
        data: {
            url: string;
            altText?: string;
            orderIndex?: number;
            isThumbnail?: boolean;
        }
    ) {
        // Check if user is the host
        const isHost = await ListingRepo.isListingHost(listingId, userId);
        if (!isHost) {
            throw new Error("Unauthorized: You can only add images to your own listings");
        }

        return ListingRepo.addListingImage({
            listingId,
            ...data,
        });
    }
}
