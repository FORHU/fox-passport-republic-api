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
                        venue: { include: { images: true } },
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
                        venue: { include: { images: true } },
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
        startAt: Date;
        endAt: Date;
    }) {
        return prisma.booking.create({
            data: {
                eventId: String(data.eventId),
                userId: String(data.userId),
                guestCount: data.guestCount,
                totalAmount: data.totalAmount,
                status: data.bookingStatus,
                startAt: data.startAt,
                endAt: data.endAt,
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
            startAt: Date;
            endAt: Date;
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

    // Get user bookings
    static async getUserBookings(userId: string) {
        return prisma.booking.findMany({
            where: { userId: String(userId) },
            include: {
                event: {
                    include: {
                        venue: { include: { images: true } },
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
