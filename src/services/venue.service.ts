import VenueRepo from "../repositories/venue.repository";
import { VenueStatus, VenueType } from "@prisma/client";
import { uploadVenueImage } from "../utils/supabase";

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
    }) {
        // Business logic: validate business rules before creation
        if (data.price && data.price < 0) {
            throw new Error("Price cannot be negative");
        }
        if (data.capacity < 1) {
            throw new Error("Capacity must be at least 1");
        }

        // Normalize defaults (previously done inside repository)
        return VenueRepo.createVenue({
            ...data,
            state: data.state ?? null,
            spaceType: data.spaceType ?? [],
            amenities: data.amenities ?? [],
            techAv: data.techAv ?? [],
            staffing: data.staffing ?? [],
            policies: data.policies ?? [],
            status: data.status ?? VenueStatus.draft,
            price: data.price ?? 0,
            images: data.images?.map((img, index) => ({
                ...img,
                orderIndex: img.orderIndex ?? index,
                isThumbnail: img.isThumbnail ?? index === 0,
            })),
        });
    }

    // ───────────────────────────────────────────────────────────
    // READ — Delegate all queries to repository
    // ───────────────────────────────────────────────────────────

    static async getVenues(filters?: {
        hostId?: string;
        type?: VenueType;
        city?: string;
        status?: VenueStatus
    }) {
        // Business logic: default to showing only published venues unless a status is explicitly requested
        const effectiveFilters = filters?.status ? filters : { ...filters, status: VenueStatus.published };
        return VenueRepo.findAllVenues(effectiveFilters);
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

    static async searchVenues(query: string, filters?: { city?: string; type?: VenueType }) {
        if (!query || query.trim().length < 2) {
            throw new Error("Search query must be at least 2 characters");
        }
        // Business logic: only searchable venues are non-archived & published
        const results = await VenueRepo.searchVenues(query.trim(), filters);
        return results.filter(v => v.status === VenueStatus.published);
    }

    static async getHostStats(hostId: string) {
        return VenueRepo.getHostVenueStats(hostId);
    }

    // ───────────────────────────────────────────────────────────
    // UPDATE — Authorization logic, delegate data access
    // ───────────────────────────────────────────────────────────

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
            spaceType?: string[];
            amenities?: string[];
            techAv?: string[];
            staffing?: string[];
            policies?: string[];
            status?: VenueStatus;
            price?: number;
            images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
        }>,
        userRole?: string
    ) {
        const isAdmin = this.isAdminRole(userRole);
        let venue;

        if (isAdmin) {
            // Admins can update any venue
            venue = await VenueRepo.findVenueByIdForAdmin(id);
            if (!venue) throw new Error("Venue not found");
        } else {
            // Non-admins must be owners
            venue = await VenueRepo.findVenueByIdAndOwner(id, hostId);
            if (!venue) throw new Error("Unauthorized or venue not found");
        }

        // Business rule: prevent changing status from archived (admins can bypass this)
        if (!isAdmin && venue.status === VenueStatus.archived) {
            throw new Error("Cannot modify archived venue");
        }

        // Business rule: validate status transition (admins bypass this)
        if (!isAdmin && data.status) {
            const validTransitions = this.getValidStatusTransitions(venue.status);
            if (!validTransitions.includes(data.status)) {
                throw new Error(`Invalid status transition from ${venue.status} to ${data.status}`);
            }
        }

        return VenueRepo.updateVenue(id, data);
    }

    // ───────────────────────────────────────────────────────────
    // DELETE — Authorization logic only
    // ───────────────────────────────────────────────────────────

    static async deleteVenue(id: string, requesterId: string, userRole?: string) {
        const isAdmin = this.isAdminRole(userRole);
        if (isAdmin) {
            // Admin can delete any non-archived venue
            const venue = await VenueRepo.findVenueByIdForAdmin(id);
            if (!venue) throw new Error("Venue not found");
            if (venue.status === VenueStatus.archived) {
                throw new Error("Venue already archived");
            }
            return VenueRepo.deleteVenue(id);
        }

        // Non-admin: must be owner
        const venue = await VenueRepo.findVenueByIdAndOwner(id, requesterId);
        if (!venue) {
            throw new Error("You are not authorized to delete this venue or it doesn't exist");
        }
        if (venue.status === VenueStatus.archived) {
            throw new Error("Venue already archived");
        }
        const result = await VenueRepo.deleteVenue(id);
        if (!result) {
            throw new Error("You are not authorized to delete this venue or it doesn't exist");
        }

        return { message: "Venue deleted successfully" };
    }

    // ───────────────────────────────────────────────────────────
    // IMAGE SERVICES — Business rules + authorization
    // ───────────────────────────────────────────────────────────

    static async addImage(
        venueId: string,
        userId: string,
        url: string,
        isThumbnail: boolean,
        altText?: string,
        orderIndex?: number,
        isAdmin: boolean = false
    ) {
        // Authorization check
        const isOwner = isAdmin || await VenueRepo.isVenueOwner(venueId, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own this venue");
        }

        // Business rule: max 20 images per venue
        const existingImages = await VenueRepo.findImagesByVenue(venueId);
        if (existingImages.length >= 20) {
            throw new Error("Maximum 20 images allowed per venue");
        }

        // If first image, force it to be thumbnail
        const shouldBeThumbnail = existingImages.length === 0 ? true : isThumbnail;

        return VenueRepo.addVenueImage({
            venueId,
            url,
            isThumbnail: shouldBeThumbnail,
            altText,
            orderIndex: orderIndex ?? existingImages.length
        });
    }

    static async uploadVenueImages(params: {
        venueId: string;
        userId: string;
        userRole?: string;
        files: Express.Multer.File[];
    }) {
        const { venueId, userId, userRole, files } = params;
        const isAdmin = this.isAdminRole(userRole);

        if (!files || files.length === 0) {
            throw new Error("No images uploaded");
        }

        const images = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const url = await uploadVenueImage(file, venueId);
            const isThumbnail = i === 0;
            const image = await this.addImage(
                venueId,
                userId,
                url,
                isThumbnail,
                file.originalname,
                i,
                isAdmin
            );
            images.push(image);
        }

        return images;
    }

    static async updateImage(
        userId: string,
        imageId: string,
        data: Partial<{
            altText: string;
            orderIndex: number;
            isThumbnail: boolean;
        }>,
        userRole?: string
    ) {
        const isAdmin = this.isAdminRole(userRole);
        const image = await VenueRepo.findImageById(imageId);
        if (!image) throw new Error("Image not found");

        const isOwner = isAdmin || image.venue.hostId === userId;
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own the venue associated with this image");
        }

        // If setting as thumbnail, use repository method to handle the swap
        if (data.isThumbnail) {
            await VenueRepo.setThumbnail(imageId, image.venueId);
            // Remove from data since we handled it
            const { isThumbnail, ...rest } = data;
            if (Object.keys(rest).length > 0) {
                return VenueRepo.updateVenueImage(imageId, rest);
            }
            return VenueRepo.findImageById(imageId);
        }

        return VenueRepo.updateVenueImage(imageId, data);
    }

    static async deleteImage(userId: string, imageId: string, userRole?: string) {
        const isAdmin = this.isAdminRole(userRole);
        const image = await VenueRepo.findImageById(imageId);
        if (!image) throw new Error("Image not found");

        const isOwner = isAdmin || image.venue.hostId === userId;
        if (!isOwner) {
            throw new Error("Unauthorized: You do not own the venue associated with this image");
        }

        // Business rule: if deleting thumbnail, promote next image
        const wasThumbnail = image.isThumbnail;
        const venueId = image.venueId;

        await VenueRepo.deleteVenueImage(imageId);

        if (wasThumbnail) {
            const remaining = await VenueRepo.findImagesByVenue(venueId);
            if (remaining.length > 0) {
                await VenueRepo.setThumbnail(remaining[0].id, venueId);
            }
        }

        return { message: "Image deleted successfully" };
    }

    static async reorderVenueImages(userId: string, venueId: string, imageOrders: { id: string; orderIndex: number }[]) {
        // Verify ownership
        const isOwner = await VenueRepo.isVenueOwner(venueId, userId);
        if (!isOwner) throw new Error("Unauthorized");

        return VenueRepo.reorderImages(venueId, imageOrders);
    }

    // ───────────────────────────────────────────────────────────
    // BUSINESS RULES HELPERS
    // ───────────────────────────────────────────────────────────

    private static getValidStatusTransitions(currentStatus: VenueStatus): VenueStatus[] {
        const transitions: Record<VenueStatus, VenueStatus[]> = {
            [VenueStatus.draft]: [VenueStatus.pending_review, VenueStatus.published, VenueStatus.archived],
            [VenueStatus.pending_review]: [VenueStatus.published, VenueStatus.rejected, VenueStatus.draft],
            [VenueStatus.published]: [VenueStatus.archived, VenueStatus.draft, VenueStatus.suspended],
            [VenueStatus.rejected]: [VenueStatus.draft, VenueStatus.pending_review],
            [VenueStatus.suspended]: [VenueStatus.draft, VenueStatus.published, VenueStatus.archived],
            [VenueStatus.archived]: [], // No transitions out of archived
        };
        return transitions[currentStatus] || [];
    }
}