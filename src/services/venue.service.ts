import VenueRepo from "../repositories/venue.repository";
import { VenueStatus, BillingRate } from "@prisma/client";

export default class VenueSvc {
    private static isAdminRole(role?: string) {
        return role ? ["admin", "super_admin", "mayor"].includes(role) : false;
    }

    // ───────────────────────────────────────────────────────────
    // CREATE
    // ───────────────────────────────────────────────────────────

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
        spaceType?: string[];
        amenities?: string[];
        techAv?: string[];
        staffing?: string[];
        policies?: string[];
        status?: VenueStatus;
        price?: number;
        billingRate?: BillingRate;
    }) {
        // Business logic: validate business rules before creation
        if (data.price && data.price < 0) {
            throw new Error("Price cannot be negative");
        }
        if (data.capacity < 1) {
            throw new Error("Capacity must be at least 1");
        }
        if (!Array.isArray(data.imgIds) || data.imgIds.length === 0) {
            throw new Error("At least one image is required");
        }
        if (data.imgIds.length > 5) {
            throw new Error("A maximum of 5 images is allowed");
        }

        // Normalize defaults (previously done inside repository)
        return VenueRepo.createVenue({
            ...data,
            state: data.state ?? undefined,
            imgIds: data.imgIds,
            billingRate: data.billingRate ?? BillingRate.daily,
            spaceType: data.spaceType ?? [],
            amenities: data.amenities ?? [],
            techAv: data.techAv ?? [],
            staffing: data.staffing ?? [],
            policies: data.policies ?? [],
            status: data.status ?? VenueStatus.pending,
            price: data.price ?? 0,
            billingRate: (data.billingRate as BillingRate) ?? BillingRate.daily,
        });
    }

    // ───────────────────────────────────────────────────────────
    // READ — Delegate all queries to repository
    // ───────────────────────────────────────────────────────────

    static async getVenues() {
        return VenueRepo.findAllVenues();
    }

    static async getVenueById(id: string) {
        const venue = await VenueRepo.findVenueById(id);

        // Business logic: check if venue is accessible
        if (!venue) {
            throw new Error("Venue not found");
        }
        if (venue.status === VenueStatus.archived) {
            throw new Error("Venue has been removed");
        }

        return venue;
    }

    static async getVenueByIdForHost(id: string, hostId: string) {
        // Host can see their own venues regardless of status
        const venue = await VenueRepo.findVenueByIdAndOwner(id, hostId);
        if (!venue) {
            throw new Error("Venue not found or access denied");
        }
        return venue;
    }

    static async updateVenue(params: {
        id: string;
        requesterId: string;
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
            billingRate: BillingRate;
        }>;
    }) {
        const { id, requesterId, data } = params;

        const venue = await VenueRepo.findVenueById(id);
        if (!venue) throw new Error("Venue not found");

        if (venue.hostId !== requesterId) {
            throw new Error("Unauthorized");
        }

        if (data.price !== undefined && data.price < 0) {
            throw new Error("Price cannot be negative");
        }
        if (data.capacity !== undefined && data.capacity < 1) {
            throw new Error("Capacity must be at least 1");
        }
        if (data.imgIds && data.imgIds.length > 5) {
            throw new Error("A maximum of 5 images is allowed");
        }

        return VenueRepo.updateVenue(id, data);
    }

    static async deleteVenue(params: {
        id: string;
        requesterId: string;
        requesterRole?: string;
    }) {
        const { id, requesterId, requesterRole } = params;
        const venue = await VenueRepo.findVenueById(id);
        if (!venue) throw new Error("Venue not found");

        const isAdmin = this.isAdminRole(requesterRole);
        if (!isAdmin && venue.hostId !== requesterId) {
            throw new Error("Unauthorized");
        }

        return VenueRepo.archiveVenue(id);
    }
}