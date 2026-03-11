import VenueRepo from "../repositories/venue.repository";
import { VenueStatus, VenueType } from "@prisma/client";

export default class VenueSvc {
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
        const venue = await VenueRepo.createVenue(data);
        return venue;
    }

    static async getVenues(filters?: { hostId?: string; type?: VenueType; city?: string; status?: VenueStatus }) {
        return VenueRepo.findAllVenues(filters);
    }

    static async getVenueById(id: string) {
        const venue = await VenueRepo.findVenueById(id);
        if (!venue) {
            throw new Error("Venue not found");
        }
        return venue;
    }

    static async updateVenue(
        id: string,
        hostId: string,
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
        const existing = await VenueRepo.findVenueById(id);
        if (!existing) {
            throw new Error("Venue not found");
        }
        if (existing.hostId !== hostId) {
            throw new Error("Unauthorized");
        }

        return VenueRepo.updateVenue(id, data);
    }

    static async deleteVenue(id: string, requesterId: string) {
        const venue = await VenueRepo.findVenueById(id);

        if (!venue) {
            throw new Error("Venue not found");
        }

        // Only the host can delete
        if (venue.hostId !== requesterId) {
            throw new Error("You are not authorized to delete this venue");
        }

        await VenueRepo.deleteVenue(id);
        return { message: "Venue deleted successfully" };
    }

    // IMAGE SERVICE METHODS
    static async addImage(venueId: string, userId: string, url: string, isThumbnail: boolean, altText?: string, orderIndex?: number) {
        const isOwner = await VenueRepo.isVenueOwner(venueId, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own this venue");
        }
        return VenueRepo.addVenueImage({ venueId, url, isThumbnail, altText, orderIndex });
    }

    static async updateImage(userId: string, imageId: string, data: Partial<any>) {
        const image = await VenueRepo.findImageById(imageId);
        if (!image) throw new Error("Image not found");

        const isOwner = image.venue.hostId === userId;
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own the venue associated with this image");
        }

        return VenueRepo.updateVenueImage(imageId, data);
    }

    static async deleteImage(userId: string, imageId: string) {
        const image = await VenueRepo.findImageById(imageId);
        if (!image) throw new Error("Image not found");

        const isOwner = image.venue.hostId === userId;
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own the venue associated with this image");
        }
        return VenueRepo.deleteVenueImage(imageId);
    }
}