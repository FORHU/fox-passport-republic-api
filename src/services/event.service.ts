import EventRepo from "../repositories/event.repository";
import { EventStatus, EventType } from "@prisma/client";

export default class EventSvc {
    static async getAllEvents(filters?: {
        venueId?: string;
        organizerId?: string;
        eventType?: EventType;
        status?: EventStatus;
    }) {
        return EventRepo.getAllEvents(filters);
    }

    static async getEventById(id: string) {
        const event = await EventRepo.getEventById(id);
        if (!event) {
            throw new Error("Event not found");
        }
        return event;
    }

    static async createEvent(data: {
        venueId: string;
        organizerId: string;
        name: string;
        description: string;
        eventType: EventType;
        startAt: Date;
        endAt: Date;
        maxAttendees: number;
        totalPrice: number;
        currency?: string;
        status?: EventStatus;
    }) {
        // Default event fields at the service layer.
        return EventRepo.createEvent({
            ...data,
            currency: data.currency ?? "PHP",
            status: data.status ?? EventStatus.draft,
        });
    }

    static async updateEvent(id: string, userId: string, data: Partial<any>) {
        // Check ownership
        const event = await EventRepo.getEventById(id);
        if (!event) throw new Error("Event not found");
        if (event.organizerId !== String(userId)) {
            throw new Error("Unauthorized");
        }
        return EventRepo.updateEvent(id, data);
    }

    static async addAssetToEvent(eventId: string, userId: string, assetId: string, quantity: number) {
        // Check ownership
        const event = await EventRepo.getEventById(eventId);
        if (!event) throw new Error("Event not found");
        if (event.organizerId !== String(userId)) {
            throw new Error("Unauthorized");
        }
        return EventRepo.addAssetToEvent(eventId, assetId, {
            quantity,
            agreedPrice: 0,
            billingRate: "one_time",
        });
    }

    static async addServiceToEvent(eventId: string, userId: string, serviceId: string, agreedPrice: number) {
        // Check ownership
        const event = await EventRepo.getEventById(eventId);
        if (!event) throw new Error("Event not found");
        if (event.organizerId !== String(userId)) {
            throw new Error("Unauthorized");
        }
        return EventRepo.addServiceToEvent(eventId, serviceId, {
            agreedPrice,
            billingRate: "one_time",
        });
    }
}
