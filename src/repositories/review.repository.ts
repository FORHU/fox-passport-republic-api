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
    static async getReviewById(id: number | string) {
        return prisma.review.findUnique({
            where: { id: Number(id) },
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
        venueId?: number | string;
        eventId?: number | string;
        userId: number | string;
        rating: number;
        comment?: string;
        isVerifiedAttendee?: boolean;
    }) {
        return prisma.review.create({
            data: {
                venueId: data.venueId ? Number(data.venueId) : undefined,
                eventId: data.eventId ? Number(data.eventId) : undefined,
                userId: Number(data.userId),
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
    static async getVenueReviews(venueId: number | string) {
        return prisma.review.findMany({
            where: { venueId: Number(venueId) },
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
    static async getEventReviews(eventId: number | string) {
        return prisma.review.findMany({
            where: { eventId: Number(eventId) },
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
    static async getUserReviews(userId: number | string) {
        return prisma.review.findMany({
            where: { userId: Number(userId) },
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
    static async updateReview(id: number | string, data: Partial<{ rating: number; comment: string }>) {
        return prisma.review.update({
            where: { id: Number(id) },
            data,
        });
    }

    // DELETE
    static async deleteReview(id: number | string) {
        return prisma.review.delete({
            where: { id: Number(id) },
        });
    }
}
