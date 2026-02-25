import { prisma } from "../utils/prisma";

export default class BookingAttendeeRepo {
    // Check if attendee exists
    static async attendeeExists(id: number | string) {
        const attendee = await prisma.bookingAttendee.findUnique({
            where: { id: Number(id) },
        });
        return !!attendee;
    }

    // CREATE
    static async createAttendee(data: {
        bookingId: number | string;
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
        ticketCode: string;
    }) {
        return prisma.bookingAttendee.create({
            data: {
                bookingId: Number(data.bookingId),
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                phone: data.phone,
                ticketCode: data.ticketCode,
            },
            include: {
                booking: {
                    include: {
                        event: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // READ ALL (by booking)
    static async getBookingAttendees(bookingId: number | string) {
        return prisma.bookingAttendee.findMany({
            where: { bookingId: Number(bookingId) },
            orderBy: { createdAt: "asc" },
        });
    }

    // READ ONE by ID
    static async getAttendeeById(id: number | string) {
        return prisma.bookingAttendee.findUnique({
            where: { id: Number(id) },
            include: {
                booking: {
                    include: {
                        event: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            }
                        }
                    }
                }
            }
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
                                venue: true,
                            }
                        },
                    },
                },
            },
        });
    }

    // UPDATE
    static async updateAttendee(id: number | string, data: Partial<{
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        checkedIn: boolean;
        checkInTime: Date;
    }>) {
        return prisma.bookingAttendee.update({
            where: { id: Number(id) },
            data,
        });
    }

    // DELETE
    static async deleteAttendee(id: number | string) {
        return prisma.bookingAttendee.delete({
            where: { id: Number(id) },
        });
    }

    // Check In Logic
    static async checkInAttendee(id: number | string) {
        return prisma.bookingAttendee.update({
            where: { id: Number(id) },
            data: {
                checkedIn: true,
                checkInTime: new Date()
            }
        });
    }

    // Validate Ticket for Event
    static async validateTicketForEvent(ticketCode: string, eventId: number | string) {
        const attendee = await prisma.bookingAttendee.findUnique({
            where: { ticketCode },
            include: {
                booking: true
            }
        });

        if (!attendee) return null;
        if (attendee.booking.eventId !== Number(eventId)) return null;

        return attendee;
    }

    // Get event attendees
    static async getEventAttendees(eventId: number | string) {
        return prisma.bookingAttendee.findMany({
            where: {
                booking: {
                    eventId: Number(eventId),
                },
            },
            include: {
                booking: {
                    select: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                }
            },
            orderBy: {
                firstName: 'asc'
            }
        });
    }

    // Get all attendees with filters
    static async getAllAttendees(filters?: {
        bookingId?: number | string;
        checkedIn?: boolean;
    }) {
        const where: any = {};
        if (filters?.bookingId) where.bookingId = Number(filters.bookingId);
        if (filters?.checkedIn !== undefined) where.checkedIn = filters.checkedIn;

        return prisma.bookingAttendee.findMany({
            where,
            include: {
                booking: {
                    include: {
                        event: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // Check if ticket code exists
    static async ticketCodeExists(ticketCode: string) {
        const attendee = await prisma.bookingAttendee.findUnique({
            where: { ticketCode },
        });
        return !!attendee;
    }

    // Check in by ticket code
    static async checkInByTicketCode(ticketCode: string) {
        return prisma.bookingAttendee.update({
            where: { ticketCode },
            data: {
                checkedIn: true,
                checkInTime: new Date(),
            },
        });
    }

    // Get listing attendees (renamed to event attendees)
    static async getListingAttendees(listingId: number | string) {
        // This method is deprecated, use getEventAttendees instead
        return this.getEventAttendees(listingId);
    }
}
