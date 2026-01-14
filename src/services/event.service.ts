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
        startDatetime: Date;
        endDatetime: Date;
        maxAttendees: number;
        totalPrice: number;
        currency?: string;
        status?: EventStatus;
    }) {
        // Ideally verify venue availability here
        return EventRepo.createEvent(data);
    }

    static async updateEvent(id: string, userId: string, data: Partial<any>) {
        // Check ownership
        const event = await EventRepo.getEventById(id);
        if (!event) throw new Error("Event not found");
        if (event.organizerId !== userId) {
            throw new Error("Unauthorized");
        }
        return EventRepo.updateEvent(id, data);
    }

    static async addAssetToEvent(eventId: string, userId: string, assetId: string, quantity: number) {
        // Check ownership
        const event = await EventRepo.getEventById(eventId);
        if (!event) throw new Error("Event not found");
        if (event.organizerId !== userId) { // Or check if venue mayor? For now assume organizer builds the event
            throw new Error("Unauthorized");
        }
        return EventRepo.addAssetToEvent(eventId, assetId, quantity);
    }

    static async addServiceToEvent(eventId: string, userId: string, serviceId: string, agreedPrice: number) {
        // Check ownership
        const event = await EventRepo.getEventById(eventId);
        if (!event) throw new Error("Event not found");
        if (event.organizerId !== userId) {
            throw new Error("Unauthorized");
        }
        return EventRepo.addServiceToEvent(eventId, serviceId, agreedPrice);
    }
}
