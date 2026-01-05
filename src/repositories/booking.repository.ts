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
        ...(filters?.userId && { userId: filters.userId }),
        ...(filters?.eventId && { eventId: filters.eventId }),
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
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            foxer: {
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
        event: {
          include: {
            foxer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            details: true,
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
        event: {
          include: {
            details: true,
          },
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
    numberOfTickets: number;
    totalAmount: number;
    bookingStatus: BookingStatus;
    confirmationCode: string;
    specialRequests?: string;
  }) {
    return prisma.booking.create({
      data: {
        eventId: data.eventId,
        userId: data.userId,
        numberOfTickets: data.numberOfTickets,
        totalAmount: data.totalAmount,
        bookingStatus: data.bookingStatus,
        confirmationCode: data.confirmationCode,
        specialRequests: data.specialRequests,
      },
      include: {
        user: true,
        event: true,
      },
    });
  }

  // UPDATE
  static async updateBooking(
    id: string,
    data: Partial<{
      numberOfTickets: number;
      totalAmount: number;
      bookingStatus: BookingStatus;
      specialRequests: string;
    }>
  ) {
    return prisma.booking.update({
      where: { id },
      data,
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
        event: {
          include: {
            details: true,
            images: {
              where: {
                isPrimary: true,
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

  // Get event bookings (for event host)
  static async getEventBookings(eventId: string) {
    return prisma.booking.findMany({
      where: { eventId },
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
