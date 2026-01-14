import VenueRepo from "../repositories/venue.repository";
import { VenueStatus, VenueType } from "@prisma/client";

export default class VenueSvc {
    static async getAllVenues(filters?: {
        mayorId?: string;
        type?: VenueType;
        city?: string;
        status?: VenueStatus;
    }) {
        return VenueRepo.getAllVenues(filters);
    }

    static async getVenueById(id: string) {
        const venue = await VenueRepo.getVenueById(id);
        if (!venue) {
            throw new Error("Venue not found");
        }
        return venue;
    }

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
        latitude?: number;
        longitude?: number;
    }) {
        return VenueRepo.createVenue(data);
    }

    static async updateVenue(id: string, userId: string, data: Partial<any>) {
        // Check ownership
        const isOwner = await VenueRepo.isVenueOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own this venue");
        }
        return VenueRepo.updateVenue(id, data);
    }

    static async deleteVenue(id: string, userId: string) {
        const isOwner = await VenueRepo.isVenueOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own this venue");
        }
        return VenueRepo.deleteVenue(id);
    }

    static async addImage(id: string, userId: string, url: string, isThumbnail: boolean) {
        const isOwner = await VenueRepo.isVenueOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own this venue");
        }
        return VenueRepo.addImage(id, url, isThumbnail);
    }
}
