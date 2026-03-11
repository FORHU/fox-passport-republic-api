import { prisma } from "../utils/prisma";

export default class ReviewRepo {
    // READ ALL
    static async getAllReviews() {
        return prisma.review.findMany({
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

    // READ ONE
    static async getReviewById(id: string) {
        return prisma.review.findUnique({
            where: { id: String(id) },
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
                venueId: data.venueId ? String(data.venueId) : undefined,
                eventId: data.eventId ? String(data.eventId) : undefined,
                userId: String(data.userId),
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
            where: { venueId: String(venueId) },
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
            where: { eventId: String(eventId) },
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

    // LIST BY USER
    static async getUserReviews(userId: string) {
        return prisma.review.findMany({
            where: { userId: String(userId) },
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

    // UPDATE
    static async updateReview(id: string, data: Partial<{ rating: number; comment: string }>) {
        return prisma.review.update({
            where: { id: String(id) },
            data,
        });
    }

    // DELETE
    static async deleteReview(id: string) {
        return prisma.review.delete({
            where: { id: String(id) },
        });
    }
}
