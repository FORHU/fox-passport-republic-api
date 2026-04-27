import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";

export default class BookingRepo {
    static async create(data: Prisma.BookingCreateInput) {
        return prisma.booking.create({
            data,
            include: {
                event: true,
                user: { select: { name: true, email: true } },
                attendees: true
            }
        });
    }

    static async findAll(filters: any) {
        return prisma.booking.findMany({
            where: filters,
            include: {
                event: true,
                user: { select: { name: true, email: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async findById(id: string) {
        return prisma.booking.findUnique({
            where: { id },
            include: {
                event: {
                    include: {
                        host: { select: { id: true, name: true } }
                    }
                },
                user: { select: { id: true, name: true, email: true } },
                attendees: {
                    include: {
                        invitedBy: { select: { id: true, name: true } }
                    }
                },
                payments: true,
                assetTransactions: true,
                serviceTransactions: true,
                venueTransactions: true
            }
        });
    }

    static async update(id: string, data: Prisma.BookingUncheckedUpdateInput) {
        return prisma.booking.update({
            where: { id },
            data,
            include: { attendees: true }
        });
    }

    static async addAttendee(bookingId: string, data: Prisma.BookingAttendeeUncheckedCreateWithoutBookingInput) {
        return prisma.bookingAttendee.create({
            data: {
                ...data,
                bookingId: bookingId
            },
            include: {
                invitedBy: { select: { id: true, name: true } }
            }
        });
    }

    static async removeAttendee(attendeeId: string) {
        return prisma.bookingAttendee.delete({
            where: { id: attendeeId }
        });
    }

    static async findAttendeeById(id: string) {
        return prisma.bookingAttendee.findUnique({
            where: { id },
            include: { booking: true }
        });
    }

    static async findAttendeeByTicketCode(ticketCode: string) {
        return prisma.bookingAttendee.findUnique({
            where: { ticketCode }
        });
    }

    static async updateAttendee(id: string, data: Prisma.BookingAttendeeUncheckedUpdateInput) {
        return prisma.bookingAttendee.update({
            where: { id },
            data
        });
    }

    static async finalizeAttendees(bookingId: string) {
        return prisma.$transaction([
            prisma.booking.update({
                where: { id: bookingId },
                data: { isGuestListLocked: true }
            }),
            prisma.bookingAttendee.updateMany({
                where: { bookingId, isDraft: true },
                data: { isDraft: false }
            })
        ]);
    }

    static async findByUserId(userId: string) {
        return prisma.booking.findMany({
            where: { userId },
            include: {
                event: true
            }
        });
    }
}
