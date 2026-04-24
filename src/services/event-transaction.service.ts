import EventTransactionRepo from "../repositories/event-transaction.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import AssetRepo from "../repositories/asset.repository";
import ServiceRepo from "../repositories/service.repository";
import VenueRepo from "../repositories/venue.repository";
import { TransactionStatus, RequestStatus } from "@prisma/client";

export default class EventTransactionSvc {
    // CREATE ASSET TRANSACTION
    static async createAssetTransaction(params: {
        eventId: string;
        assetId: string;
        providerId: string;
        quantity: number;
        hostId: string;
    }) {
        const { eventId, assetId, providerId, quantity, hostId } = params;

        // 1. Verify Request Status
        const request = await EventRequestRepo.findRequestById(eventId);
        if (!request) throw new Error("Event request not found");
        if (request.requestStatus !== RequestStatus.approved) {
            throw new Error("Transactions can only be created for approved requests");
        }
        if (request.organizerId !== hostId) throw new Error("Unauthorized: Only the host of this event can create transactions");

        // 2. Fetch Base Price
        const asset = await AssetRepo.findAssetById(assetId);
        if (!asset) throw new Error("Asset not found");

        return EventTransactionRepo.createAssetTransaction({
            eventId,
            assetId,
            providerId,
            quantity,
            agreedPrice: asset.price, // Initialize from base price
        });
    }

    // CREATE SERVICE TRANSACTION
    static async createServiceTransaction(params: {
        eventId: string;
        serviceId: string;
        providerId: string;
        hostId: string;
    }) {
        const { eventId, serviceId, providerId, hostId } = params;

        const request = await EventRequestRepo.findRequestById(eventId);
        if (!request || request.requestStatus !== RequestStatus.approved) {
            throw new Error("Transactions can only be created for approved requests");
        }
        if (request.organizerId !== hostId) throw new Error("Unauthorized");

        const service = await ServiceRepo.getServiceById(serviceId);
        if (!service) throw new Error("Service not found");

        return EventTransactionRepo.createServiceTransaction({
            eventId,
            serviceId,
            providerId,
            agreedPrice: service.price,
        });
    }

    // CREATE VENUE TRANSACTION
    static async createVenueTransaction(params: {
        eventId: string;
        venueId: string;
        providerId: string;
        hostId: string;
    }) {
        const { eventId, venueId, providerId, hostId } = params;

        const request = await EventRequestRepo.findRequestById(eventId);
        if (!request || request.requestStatus !== RequestStatus.approved) {
            throw new Error("Transactions can only be created for approved requests");
        }
        if (request.organizerId !== hostId) throw new Error("Unauthorized");

        const venue = await VenueRepo.findVenueById(venueId);
        if (!venue) throw new Error("Venue not found");

        return EventTransactionRepo.createVenueTransaction({
            eventId,
            venueId,
            providerId,
            agreedPrice: venue.price,
        });
    }

    // UPDATE TRANSACTION (Role Specific)
    static async updateTransactionStatus(params: {
        type: 'asset' | 'service' | 'venue';
        id: string;
        status: TransactionStatus;
        agreedPrice?: number;
        requesterRole: string[];
    }) {
        const { type, id, status, agreedPrice, requesterRole } = params;

        // Verify Roles
        if (type === 'asset' && !requesterRole.includes('foxerAsset')) throw new Error("Unauthorized: Only foxerAsset can review asset transactions");
        if (type === 'service' && !requesterRole.includes('foxerService')) throw new Error("Unauthorized: Only foxerService can review service transactions");
        if (type === 'venue' && !requesterRole.includes('mayor')) throw new Error("Unauthorized: Only mayor can review venue transactions");

        const data: any = { status };
        if (agreedPrice !== undefined) {
            data.agreedPrice = agreedPrice;
        }

        if (type === 'asset') return EventTransactionRepo.updateAssetTransaction(id, data);
        if (type === 'service') return EventTransactionRepo.updateServiceTransaction(id, data);
        return EventTransactionRepo.updateVenueTransaction(id, data);
    }

    static async getTransactionsByEvent(eventId: string) {
        return EventTransactionRepo.findTransactionsByEventId(eventId);
    }
}