import BookingRepo from "../repositories/booking.repository";
import { BookingStatus } from "@prisma/client";

export default class BookingSvc {
    static async createBooking(data: any) {
        // Ensure dates are actual Date objects if they come as strings
        const bookingData = {
            ...data,
            startAt: data.startAt ? new Date(data.startAt) : new Date(),
            endAt: data.endAt ? new Date(data.endAt) : new Date(),
        };
        return BookingRepo.createBooking(bookingData);
    }

    static async getAllBookings(filters: any) {
        return BookingRepo.findAllBookings(filters);
    }

    static async getBookingById(id: string) {
        const booking = await BookingRepo.findBookingById(id);
        if (!booking) throw new Error("Booking not found");
        return booking;
    }

    static async getUserBookings(userId: string) {
        return BookingRepo.findUserBookings(userId);
    }

    static async updateStatus(id: string, status: BookingStatus) {
        return BookingRepo.updateBookingStatus(id, status);
    }
}
