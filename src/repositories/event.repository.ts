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
                ...(filters?.venueId && { venueId: String(filters.venueId) }),
                ...(filters?.organizerId && { organizerId: String(filters.organizerId) }),
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
                        name: true,
                        profileImage: true,
                    }
                }
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // READ ONE
    static async getEventById(id: string) {
        return prisma.event.findUnique({
            where: { id: String(id) },
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
                venueId: String(data.venueId),
                organizerId: String(data.organizerId),
                name: data.name,
                description: data.description,
                eventType: data.eventType,
                startDatetime: data.startDatetime,
                endDatetime: data.endDatetime,
                maxAttendees: data.maxAttendees,
                totalPrice: data.totalPrice,
                ...(data.currency ? { currency: data.currency } : {}),
                ...(data.status ? { status: data.status } : {}),
            },
        });
    }

    // UPDATE
    static async updateEvent(id: string, data: Partial<any>) {
        return prisma.event.update({
            where: { id: String(id) },
            data,
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

    // Link Asset to Event
    static async addAssetToEvent(eventId: string, assetId: string, quantity: number) {
        return prisma.eventAsset.create({
            data: {
                eventId: String(eventId),
                assetId: String(assetId),
                quantity
            }
        });
    }

    // Link Service to Event
    static async addServiceToEvent(eventId: string, serviceId: string, agreedPrice: number) {
        return prisma.eventService.create({
            data: {
                eventId: String(eventId),
                serviceId: String(serviceId),
                agreedPrice
            }
        });
    }
}
