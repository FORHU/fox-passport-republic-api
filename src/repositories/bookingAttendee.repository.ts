import { prisma } from "../utils/prisma";

export default class BookingAttendeeRepo {
    // READ ALL with filters
    static async getAllAttendees(filters?: {
        bookingId?: string;
        checkedIn?: boolean;
    }) {
        return prisma.bookingAttendee.findMany({
            where: {
                ...(filters?.bookingId && { bookingId: filters.bookingId }),
                ...(filters?.checkedIn !== undefined && { checkedIn: filters.checkedIn }),
            },
            include: {
                booking: {
                    include: {
                        event: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                firstName: "asc",
            },
        });
    }

    // READ ONE by ID
    static async getAttendeeById(id: string) {
        return prisma.bookingAttendee.findUnique({
            where: { id },
            include: {
                booking: {
                    include: {
                        event: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // READ ONE by Ticket Code
    static async getAttendeeByTicketCode(ticketCode: string) {
        return prisma.bookingAttendee.findUnique({
            where: { ticketCode },
            include: {
                booking: {
                    include: {
                        event: {
                            include: {
                                details: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // CREATE
    static async createAttendee(data: {
        bookingId: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        ticketCode: string;
    }) {
        return prisma.bookingAttendee.create({
            data: {
                bookingId: data.bookingId,
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                phone: data.phone,
                ticketCode: data.ticketCode,
            },
            include: {
                booking: true,
            },
        });
    }

    // UPDATE
    static async updateAttendee(
        id: string,
        data: Partial<{
            firstName: string;
            lastName: string;
            email: string;
            phone: string;
            checkedIn: boolean;
            checkInTime: Date;
        }>
    ) {
        return prisma.bookingAttendee.update({
            where: { id },
            data,
            include: {
                booking: true,
            },
        });
    }

    // CHECK IN
    static async checkInAttendee(id: string) {
        return prisma.bookingAttendee.update({
            where: { id },
            data: {
                checkedIn: true,
                checkInTime: new Date(),
            },
            include: {
                booking: {
                    include: {
                        event: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // CHECK IN by Ticket Code
    static async checkInByTicketCode(ticketCode: string) {
        return prisma.bookingAttendee.update({
            where: { ticketCode },
            data: {
                checkedIn: true,
                checkInTime: new Date(),
            },
            include: {
                booking: {
                    include: {
                        event: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // DELETE
    static async deleteAttendee(id: string) {
        return prisma.bookingAttendee.delete({
            where: { id },
        });
    }

    // Check if attendee exists
    static async attendeeExists(id: string) {
        const attendee = await prisma.bookingAttendee.findUnique({
            where: { id },
            select: { id: true },
        });
        return !!attendee;
    }

    // Check if ticket code exists
    static async ticketCodeExists(ticketCode: string) {
        const attendee = await prisma.bookingAttendee.findUnique({
            where: { ticketCode },
            select: { id: true },
        });
        return !!attendee;
    }

    // Get booking attendees
    static async getBookingAttendees(bookingId: string) {
        return prisma.bookingAttendee.findMany({
            where: { bookingId },
            orderBy: {
                firstName: "asc",
            },
        });
    }

    // Get event attendees
    static async getEventAttendees(eventId: string) {
        return prisma.bookingAttendee.findMany({
            where: {
                booking: {
                    eventId,
                },
            },
            include: {
                booking: {
                    select: {
                        id: true,
                        confirmationCode: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                firstName: "asc",
            },
        });
    }
}
