import { prisma } from "../utils/prisma";

export default class ReviewRepo {
    // READ ALL with filters
    static async getAllReviews(filters?: {
        listingId?: string;
        userId?: string;
        isVerifiedAttendee?: boolean;
    }) {
        return prisma.review.findMany({
            where: {
                ...(filters?.listingId && { listingId: filters.listingId }),
                ...(filters?.userId && { userId: filters.userId }),
                ...(filters?.isVerifiedAttendee !== undefined && { isVerifiedAttendee: filters.isVerifiedAttendee }),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        profileImage: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // READ ONE by ID
    static async getReviewById(id: string) {
        return prisma.review.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        profileImage: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                    },
                },
            },
        });
    }

    // CREATE
    static async createReview(data: {
        listingId: string;
        userId: string;
        rating: number;
        comment?: string;
        isVerifiedAttendee?: boolean;
    }) {
        return prisma.review.create({
            data: {
                listingId: data.listingId,
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
                        username: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
    }

    // UPDATE
    static async updateReview(
        id: string,
        data: Partial<{
            rating: number;
            comment: string;
        }>
    ) {
        return prisma.review.update({
            where: { id },
            data,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
    }

    // DELETE
    static async deleteReview(id: string) {
        return prisma.review.delete({
            where: { id },
        });
    }

    // Check if review exists
    static async reviewExists(id: string) {
        const review = await prisma.review.findUnique({
            where: { id },
            select: { id: true },
        });
        return !!review;
    }

    // Check if user owns review
    static async isReviewOwner(reviewId: string, userId: string) {
        const review = await prisma.review.findFirst({
            where: {
                id: reviewId,
                userId: userId,
            },
            select: { id: true },
        });
        return !!review;
    }

    // Get listing reviews
    static async getListingReviews(listingId: string) {
        return prisma.review.findMany({
            where: { listingId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        profileImage: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // Get user reviews
    static async getUserReviews(userId: string) {
        return prisma.review.findMany({
            where: { userId },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }
}
