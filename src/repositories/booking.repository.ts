import { prisma } from "../utils/prisma";
import { BookingStatus } from "@prisma/client";

export default class BookingRepo {
    // READ ALL with filters
    static async getAllBookings(filters?: {
        userId?: number | string;
        eventId?: number | string;
        bookingStatus?: BookingStatus;
    }) {
        return prisma.booking.findMany({
            where: {
                ...(filters?.userId && { userId: Number(filters.userId) }),
                ...(filters?.eventId && { eventId: Number(filters.eventId) }),
                ...(filters?.bookingStatus && { status: filters.bookingStatus }),
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
                event: {
                    include: {
                        venue: true,
                    }
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
    static async getBookingById(id: number | string) {
        return prisma.booking.findUnique({
            where: { id: Number(id) },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                event: {
                    include: {
                        venue: true,
                    }
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
                event: {
                    include: {
                        venue: true,
                    }
                },
                attendees: true,
                payments: true,
            },
        });
    }

    // CREATE
    static async createBooking(data: {
        eventId: string;
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
                eventId: Number(data.eventId),
                userId: Number(data.userId),
                guestCount: data.guestCount || 0,
                totalAmount: data.totalAmount || 0,
                status: data.bookingStatus || BookingStatus.draft,
                confirmationCode: data.confirmationCode,
                specialRequests: data.specialRequests,
                currentStep: data.currentStep || 1,
                expiresAt: data.expiresAt,
            },
            include: {
                user: true,
                event: true,
            },
        });
    }

    // UPDATE
    static async updateBooking(
        id: number | string,
        data: Partial<{
            guestCount: number;
            totalAmount: number;
            bookingStatus: BookingStatus;
            specialRequests: string;
            currentStep: number;
            expiresAt: Date | null;
        }>
    ) {
        const { bookingStatus, ...rest } = data;
        return prisma.booking.update({
            where: { id: Number(id) },
            data: {
                ...rest,
                ...(bookingStatus && { status: bookingStatus }),
            },
            include: {
                user: true,
                event: true,
                attendees: true,
                payments: true,
            },
        });
    }

    // DELETE (Cancel)
    static async deleteBooking(id: number | string) {
        return prisma.booking.delete({
            where: { id: Number(id) },
        });
    }

    // Check if booking exists
    static async bookingExists(id: number | string) {
        const booking = await prisma.booking.findUnique({
            where: { id: Number(id) },
            select: { id: true },
        });
        return !!booking;
    }

    // Check if user owns booking
    static async isBookingOwner(bookingId: number | string, userId: number | string) {
        const booking = await prisma.booking.findFirst({
            where: {
                id: Number(bookingId),
                userId: Number(userId),
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
    static async getUserBookings(userId: number | string) {
        return prisma.booking.findMany({
            where: { userId: Number(userId) },
            include: {
                event: {
                    include: {
                        venue: true,
                    }
                },
                attendees: true,
                payments: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // Get event bookings (for event organizer)
    static async getEventBookings(eventId: number | string) {
        return prisma.booking.findMany({
            where: { eventId: Number(eventId) },
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
}
