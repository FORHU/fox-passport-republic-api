import BookingRepo from "../repositories/booking.repository";
import crypto from "crypto";
import { BookingStatus } from "@prisma/client";

export default class BookingSvc {
    // Generate unique confirmation code
    static generateConfirmationCode(): string {
        return crypto.randomBytes(4).toString("hex").toUpperCase();
    }

    // Calculate expiry time (30 minutes from now)
    static calculateExpiryTime(): Date {
        const expiryTime = new Date();
        expiryTime.setMinutes(expiryTime.getMinutes() + 30);
        return expiryTime;
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

    // ========== MULTI-STEP BOOKING METHODS ==========

    // STEP 1: CREATE DRAFT BOOKING (Event Selection)
    static async createDraftBooking(data: {
        eventId: string;
        userId: string;
    }) {
        let confirmationCode = this.generateConfirmationCode();
        while (await BookingRepo.confirmationCodeExists(confirmationCode)) {
            confirmationCode = this.generateConfirmationCode();
        }

        return BookingRepo.createBooking({
            eventId: data.eventId,
            userId: data.userId,
            bookingStatus: BookingStatus.draft,
            confirmationCode,
            currentStep: 1,
            expiresAt: this.calculateExpiryTime(),
        });
    }

    // STEP 2: UPDATE TICKETS & AMOUNT
    static async updateDraftTickets(
        draftId: string,
        userId: string,
        data: {
            numberOfTickets: number;
            totalAmount: number;
        }
    ) {
        const booking = await BookingRepo.getBookingById(draftId);

        if (!booking) {
            throw new Error("Draft booking not found");
        }
        if (booking.userId !== userId) {
            throw new Error("Unauthorized: You can only update your own bookings");
        }
        if (booking.bookingStatus !== BookingStatus.draft) {
            throw new Error("Booking is no longer in draft status");
        }

        // Check if draft has expired
        if (booking.expiresAt && booking.expiresAt < new Date()) {
            throw new Error("Draft booking has expired");
        }

        return BookingRepo.updateBooking(draftId, {
            numberOfTickets: data.numberOfTickets,
            totalAmount: data.totalAmount,
            currentStep: 2,
            expiresAt: this.calculateExpiryTime(), // Extend expiry
        });
    }

    // STEP 3: UPDATE CUSTOMER INFO
    static async updateDraftCustomerInfo(
        draftId: string,
        userId: string,
        data: {
            specialRequests?: string;
        }
    ) {
        const booking = await BookingRepo.getBookingById(draftId);

        if (!booking) {
            throw new Error("Draft booking not found");
        }
        if (booking.userId !== userId) {
            throw new Error("Unauthorized: You can only update your own bookings");
        }
        if (booking.bookingStatus !== BookingStatus.draft) {
            throw new Error("Booking is no longer in draft status");
        }

        if (booking.expiresAt && booking.expiresAt < new Date()) {
            throw new Error("Draft booking has expired");
        }

        return BookingRepo.updateBooking(draftId, {
            specialRequests: data.specialRequests,
            currentStep: 3,
            expiresAt: this.calculateExpiryTime(),
        });
    }

    // STEP 4: CONFIRM BOOKING (Final Step)
    static async confirmDraftBooking(draftId: string, userId: string) {
        const booking = await BookingRepo.getBookingById(draftId);

        if (!booking) {
            throw new Error("Draft booking not found");
        }
        if (booking.userId !== userId) {
            throw new Error("Unauthorized: You can only confirm your own bookings");
        }
        if (booking.bookingStatus !== BookingStatus.draft) {
            throw new Error("Booking is no longer in draft status");
        }

        if (booking.expiresAt && booking.expiresAt < new Date()) {
            throw new Error("Draft booking has expired");
        }

        // Validate all required fields are filled
        if (!booking.numberOfTickets || booking.numberOfTickets < 1) {
            throw new Error("Number of tickets is required");
        }
        if (!booking.totalAmount || booking.totalAmount.toNumber() <= 0) {
            throw new Error("Total amount is required");
        }

        // Update to pending (awaiting payment) or confirmed
        return BookingRepo.updateBooking(draftId, {
            bookingStatus: BookingStatus.pending,
            currentStep: 4,
            expiresAt: null, // Remove expiry once confirmed
        });
    }

    // ========== SINGLE-STEP BOOKING (Legacy - keep for backward compatibility) ==========

    // CREATE BOOKING (Old method - creates confirmed booking directly)
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
            currentStep: 4, // Mark as completed all steps
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

    // CLEANUP: Delete expired drafts
    static async cleanupExpiredDrafts() {
        return BookingRepo.deleteExpiredDrafts();
    }
}