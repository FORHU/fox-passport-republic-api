import { prisma } from "../utils/prisma";
import { EventStatus, EventType } from "@prisma/client";

export default class EventRepo {
    // READ ALL
    static async getAllEvents(filters?: {
        venueId?: string;
        organizerId?: string;
        eventType?: EventType;
        status?: EventStatus;
    }) {
        return prisma.event.findMany({
            where: {
                ...(filters?.venueId && { venueId: filters.venueId }),
                ...(filters?.organizerId && { organizerId: filters.organizerId }),
                ...(filters?.eventType && { eventType: filters.eventType }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                venue: {
                    include: {
                        images: true
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
    static async getEventById(id: string) {
        return prisma.event.findUnique({
            where: { id },
            include: {
                venue: {
                    include: {
                        images: true
                    }
                },
                eventAssets: {
                    include: {
                        asset: {
                            include: {
                                images: true
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
        return prisma.event.create({
            data: {
                venueId: data.venueId,
                organizerId: data.organizerId,
                name: data.eventName,
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
    static async updateEvent(id: string, data: Partial<any>) {
        return prisma.event.update({
            where: { id },
            data,
        });
    }

    // Link Asset to Event
    static async addAssetToEvent(eventId: string, assetId: string, quantity: number, pricePerUnit: number) {
        return prisma.eventAsset.create({
            data: {
                eventId,
                assetId,
                quantity,
                pricePerUnit
            }
        });
    }

    // Link Service to Event
    static async addServiceToEvent(eventId: string, serviceId: string, agreedPrice: number) {
        return prisma.eventService.create({
            data: {
                eventId,
                serviceId,
                agreedPrice
            }
        });
    }
}

