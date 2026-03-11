import { prisma } from "../utils/prisma";
import { EventStatus, EventType } from "@prisma/client";

export default class EventRepo {
    // READ ALL
    static async getAllEvents(filters?: {
        venueId?: number | string;
        organizerId?: number | string;
        eventType?: EventType;
        status?: EventStatus;
    }) {
        return prisma.event.findMany({
            where: {
                ...(filters?.venueId && { venueId: Number(filters.venueId) }),
                ...(filters?.organizerId && { organizerId: Number(filters.organizerId) }),
                ...(filters?.eventType && { eventType: filters.eventType }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                venue: {
                    include: {
                        venueImages: true
                    }
                },
                eventAssets: {
                    include: {
                        asset: true
                    }
                },
                eventServices: {
                    include: {
                        service: true
                    }
                },
                organizer: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                startDatetime: "asc",
            },
        });
    }

    // READ ONE
    static async getEventById(id: number | string) {
        return prisma.event.findUnique({
            where: { id: Number(id) },
            include: {
                venue: {
                    include: {
                        venueImages: true
                    }
                },
                eventAssets: {
                    include: {
                        asset: {
                            include: {
                                assetImages: true
                            }
                        }
                    }
                },
                eventServices: {
                    include: {
                        service: true
                    }
                },
                organizer: true,
            },
        });
    }

    // CREATE
    static async createEvent(data: {
        venueId: number | string;
        organizerId: number | string;
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
        return prisma.event.create({
            data: {
                venueId: Number(data.venueId),
                organizerId: Number(data.organizerId),
                name: data.name,
                description: data.description,
                eventType: data.eventType,
                startDatetime: data.startDatetime,
                endDatetime: data.endDatetime,
                maxAttendees: data.maxAttendees,
                totalPrice: data.totalPrice,
                currency: data.currency || "PHP",
                status: data.status || EventStatus.draft,
            },
        });
    }

    // UPDATE
    static async updateEvent(id: number | string, data: Partial<any>) {
        return prisma.event.update({
            where: { id: Number(id) },
            data,
        });
    }

    // Link Asset to Event
    static async addAssetToEvent(eventId: number | string, assetId: number | string, quantity: number) {
        return prisma.eventAsset.create({
            data: {
                eventId: Number(eventId),
                assetId: Number(assetId),
                quantity
            }
        });
    }

    // Link Service to Event
    static async addServiceToEvent(eventId: number | string, serviceId: number | string, agreedPrice: number) {
        return prisma.eventService.create({
            data: {
                eventId: Number(eventId),
                serviceId: Number(serviceId),
                agreedPrice
            }
        });
    }
}

