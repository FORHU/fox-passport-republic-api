import { prisma } from "../utils/prisma";

export default class ReviewRepo {
    // CREATE
    static async createReview(data: {
        venueId?: string;
        eventId?: string;
        userId: string;
        rating: number;
        comment?: string;
        isVerifiedAttendee?: boolean;
    }) {
        return prisma.review.create({
            data: {
                venueId: data.venueId,
                eventId: data.eventId,
                userId: data.userId,
                rating: data.rating,
                comment: data.comment,
                isVerifiedAttendee: data.isVerifiedAttendee || false,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });
    }

    // LIST BY VENUE
    static async getVenueReviews(venueId: string) {
        return prisma.review.findMany({
            where: { venueId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });
    }

    // LIST BY EVENT
    static async getEventReviews(eventId: string) {
        return prisma.review.findMany({
            where: { eventId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });
    }
}
