import { prisma } from "../utils/prisma";
import { BookingStatus } from "@prisma/client";

export default class BookingRepo {
    // READ ALL with filters
    static async getAllBookings(filters?: {
        userId?: string;
        eventId?: string;
        bookingStatus?: BookingStatus;
    }) {
        return prisma.booking.findMany({
            where: {
                ...(filters?.userId && { userId: String(filters.userId) }),
                ...(filters?.eventId && { eventId: String(filters.eventId) }),
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
    static async getBookingById(id: string) {
        return prisma.booking.findUnique({
            where: { id: String(id) },
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
        guestCount: number;
        totalAmount: number;
        bookingStatus: BookingStatus;
        confirmationCode: string;
        specialRequests?: string;
        currentStep: number;
        expiresAt?: Date;
    }) {
        return prisma.booking.create({
            data: {
                eventId: String(data.eventId),
                userId: String(data.userId),
                guestCount: data.guestCount,
                totalAmount: data.totalAmount,
                status: data.bookingStatus,
                confirmationCode: data.confirmationCode,
                specialRequests: data.specialRequests,
                currentStep: data.currentStep,
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
            where: { id: String(id) },
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
    static async deleteBooking(id: string) {
        return prisma.booking.delete({
            where: { id: String(id) },
        });
    }

    // Check if booking exists
    static async bookingExists(id: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: String(id) },
            select: { id: true },
        });
        return !!booking;
    }

    // Check if user owns booking
    static async isBookingOwner(bookingId: string, userId: string) {
        const booking = await prisma.booking.findFirst({
            where: {
                id: String(bookingId),
                userId: String(userId),
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
            where: { userId: String(userId) },
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
    static async getEventBookings(eventId: string) {
        return prisma.booking.findMany({
            where: { eventId: String(eventId) },
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
