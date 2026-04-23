import { prisma } from "../utils/prisma";
import { BookingStatus } from "@prisma/client";

export default class BookingRepo {
    static async createBooking(data: {
        eventId: string;
        userId: string;
        guestCount: number;
        totalAmount: number;
        startAt: Date;
        endAt: Date;
        status?: BookingStatus;
    }) {
        return prisma.booking.create({
            data,
            include: {
                event: { include: { template: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        });
    }

    static async findBookingById(id: string) {
        return prisma.booking.findUnique({
            where: { id },
            include: {
                event: { include: { template: true } },
                user: { select: { id: true, name: true, email: true } },
                attendees: true,
                payments: true,
            },
        });
    }

    static async findUserBookings(userId: string) {
        return prisma.booking.findMany({
            where: { userId },
            include: {
                event: { include: { template: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    static async findAllBookings(filters: any) {
        return prisma.booking.findMany({
            where: {
                ...(filters.userId && { userId: filters.userId }),
                ...(filters.status && { status: filters.status }),
            },
            include: {
                event: { include: { template: true } },
                user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    static async updateBookingStatus(id: string, status: BookingStatus) {
        return prisma.booking.update({
            where: { id },
            data: { status },
        });
    }
}
