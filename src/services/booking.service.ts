import BookingRepo from "../repositories/booking.repository";
import crypto from "crypto";
import { BookingStatus } from "@prisma/client";

export default class BookingSvc {
    // Generate unique confirmation code
    static generateConfirmationCode(): string {
        return crypto.randomBytes(4).toString("hex").toUpperCase();
    }

    // GET ALL BOOKINGS
    static async getAllBookings(filters?: {
        userId?: string;
        eventId?: string;
        bookingStatus?: BookingStatus;
    }) {
        return BookingRepo.getAllBookings(filters);
    }

    // GET BOOKING BY ID
    static async getBookingById(id: string) {
        const booking = await BookingRepo.getBookingById(id);
        if (!booking) {
            throw new Error("Booking not found");
        }
        return booking;
    }

    // GET BOOKING BY CONFIRMATION CODE
    static async getBookingByConfirmationCode(confirmationCode: string) {
        const booking = await BookingRepo.getBookingByConfirmationCode(confirmationCode);
        if (!booking) {
            throw new Error("Booking not found");
        }
        return booking;
    }

    // CREATE BOOKING
    static async createBooking(data: {
        eventId: string;
        userId: string;
        numberOfTickets: number;
        totalAmount: number;
        bookingStatus?: BookingStatus;
        specialRequests?: string;
    }) {
        // Generate unique confirmation code
        let confirmationCode = this.generateConfirmationCode();
        while (await BookingRepo.confirmationCodeExists(confirmationCode)) {
            confirmationCode = this.generateConfirmationCode();
        }

        return BookingRepo.createBooking({
            eventId: data.eventId,
            userId: data.userId,
            numberOfTickets: data.numberOfTickets,
            totalAmount: data.totalAmount,
            bookingStatus: data.bookingStatus || BookingStatus.pending,
            confirmationCode,
            specialRequests: data.specialRequests,
        });
    }

    // UPDATE BOOKING
    static async updateBooking(
        id: string,
        userId: string,
        data: Partial<{
            numberOfTickets: number;
            totalAmount: number;
            bookingStatus: BookingStatus;
            specialRequests: string;
        }>
    ) {
        // Check if booking exists
        const exists = await BookingRepo.bookingExists(id);
        if (!exists) {
            throw new Error("Booking not found");
        }

        // Check if user owns the booking
        const isOwner = await BookingRepo.isBookingOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You can only update your own bookings");
        }

        return BookingRepo.updateBooking(id, data);
    }

    // DELETE BOOKING (Cancel)
    static async deleteBooking(id: string, userId: string) {
        // Check if booking exists
        const exists = await BookingRepo.bookingExists(id);
        if (!exists) {
            throw new Error("Booking not found");
        }

        // Check if user owns the booking
        const isOwner = await BookingRepo.isBookingOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You can only cancel your own bookings");
        }

        return BookingRepo.deleteBooking(id);
    }

    // GET USER BOOKINGS
    static async getUserBookings(userId: string) {
        return BookingRepo.getUserBookings(userId);
    }

    // GET EVENT BOOKINGS (for event host)
    static async getEventBookings(eventId: string, userId: string) {
        // You might want to add authorization check here to ensure
        // only the event host can see bookings
        return BookingRepo.getEventBookings(eventId);
    }
}

