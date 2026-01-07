import { prisma } from "../utils/prisma";
import { BookingStatus } from "@prisma/client";

export default class BookingRepo {
    // READ ALL with filters
    static async getAllBookings(filters?: {
        userId?: string;
        listingId?: string;
        bookingStatus?: BookingStatus;
    }) {
        return prisma.booking.findMany({
            where: {
                ...(filters?.userId && { userId: filters.userId }),
                ...(filters?.listingId && { listingId: filters.listingId }),
                ...(filters?.bookingStatus && { bookingStatus: filters.bookingStatus }),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        status: true,
                        host: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
                attendees: true,
                payments: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // READ ONE by ID
    static async getBookingById(id: string) {
        return prisma.booking.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                listing: {
                    include: {
                        host: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        location: true,
                        pricing: true,
                        availability: true,
                    },
                },
                attendees: true,
                payments: true,
            },
        });
    }

    // READ ONE by Confirmation Code
    static async getBookingByConfirmationCode(confirmationCode: string) {
        return prisma.booking.findUnique({
            where: { confirmationCode },
            include: {
                user: true,
                listing: {
                    include: {
                        location: true,
                        pricing: true,
                        availability: true,
                    },
                },
                attendees: true,
                payments: true,
            },
        });
    }

    // CREATE (now supports optional fields for draft bookings)
    static async createBooking(data: {
        listingId: string;
        userId: string;
        guestCount?: number;
        totalAmount?: number;
        bookingStatus?: BookingStatus;
        confirmationCode: string;
        specialRequests?: string;
        currentStep?: number;
        expiresAt?: Date;
    }) {
        return prisma.booking.create({
            data: {
                listingId: data.listingId,
                userId: data.userId,
                guestCount: data.guestCount,
                totalAmount: data.totalAmount,
                bookingStatus: data.bookingStatus || BookingStatus.draft,
                confirmationCode: data.confirmationCode,
                specialRequests: data.specialRequests,
                currentStep: data.currentStep || 1,
                expiresAt: data.expiresAt,
            },
            include: {
                user: true,
                listing: true,
            },
        });
    }

    // UPDATE (now supports currentStep and expiresAt)
    static async updateBooking(
        id: string,
        data: Partial<{
            guestCount: number;
            totalAmount: number;
            bookingStatus: BookingStatus;
            specialRequests: string;
            currentStep: number;
            expiresAt: Date | null;
        }>
    ) {
        return prisma.booking.update({
            where: { id },
            data,
            include: {
                user: true,
                listing: true,
                attendees: true,
                payments: true,
            },
        });
    }

    // DELETE (Cancel)
    static async deleteBooking(id: string) {
        return prisma.booking.delete({
            where: { id },
        });
    }

    // Check if booking exists
    static async bookingExists(id: string) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            select: { id: true },
        });
        return !!booking;
    }

    // Check if user owns booking
    static async isBookingOwner(bookingId: string, userId: string) {
        const booking = await prisma.booking.findFirst({
            where: {
                id: bookingId,
                userId: userId,
            },
            select: { id: true },
        });
        return !!booking;
    }

    // Check if confirmation code exists
    static async confirmationCodeExists(confirmationCode: string) {
        const booking = await prisma.booking.findUnique({
            where: { confirmationCode },
            select: { id: true },
        });
        return !!booking;
    }

    // Get user bookings
    static async getUserBookings(userId: string) {
        return prisma.booking.findMany({
            where: { userId },
            include: {
                listing: {
                    include: {
                        location: true,
                        images: {
                            where: {
                                isThumbnail: true,
                            },
                            take: 1,
                        },
                    },
                },
                attendees: true,
                payments: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // Get listing bookings (for listing host)
    static async getListingBookings(listingId: string) {
        return prisma.booking.findMany({
            where: { listingId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                attendees: true,
                payments: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // NEW: Delete expired draft bookings (for cleanup job)
    static async deleteExpiredDrafts() {
        return prisma.booking.deleteMany({
            where: {
                bookingStatus: BookingStatus.draft,
                expiresAt: {
                    lt: new Date(), // Less than current time
                },
            },
        });
    }
}