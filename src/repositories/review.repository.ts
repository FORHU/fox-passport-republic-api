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
        userId: string;
        entityId: string;
        entityType: string;
        rating: number;
        comment?: string;
    }) {
        return prisma.review.create({
            data: {
                userId: String(data.userId),
                entityId: String(data.entityId),
                entityType: String(data.entityType),
                rating: data.rating,
                comment: data.comment,
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
            where: { entityType: "venue", entityId: String(venueId) },
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
            where: { entityType: "event", entityId: String(eventId) },
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
