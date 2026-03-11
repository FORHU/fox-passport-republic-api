import BookingAttendeeRepo from "../repositories/bookingAttendee.repository";
import crypto from "crypto";

export default class BookingAttendeeSvc {
    // Generate unique ticket code
    static generateTicketCode(): string {
        return `TKT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    }

    // GET ALL ATTENDEES
    static async getAllAttendees(filters?: {
        bookingId?: string;
        checkedIn?: boolean;
    }) {
        return BookingAttendeeRepo.getAllAttendees({
            ...(filters?.bookingId && { bookingId: String(filters.bookingId) }),
            checkedIn: filters?.checkedIn,
        });
    }

    // GET ATTENDEE BY ID
    static async getAttendeeById(id: string) {
        const attendee = await BookingAttendeeRepo.getAttendeeById(String(id));
        if (!attendee) {
            throw new Error("Attendee not found");
        }
        return attendee;
    }

    // GET ATTENDEE BY TICKET CODE
    static async getAttendeeByTicketCode(ticketCode: string) {
        const attendee = await BookingAttendeeRepo.getAttendeeByTicketCode(ticketCode);
        if (!attendee) {
            throw new Error("Attendee not found");
        }
        return attendee;
    }

    // CREATE ATTENDEE
    static async createAttendee(data: {
        bookingId: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
    }) {
        // Generate unique ticket code
        let ticketCode = this.generateTicketCode();
        while (await BookingAttendeeRepo.ticketCodeExists(ticketCode)) {
            ticketCode = this.generateTicketCode();
        }

        return BookingAttendeeRepo.createAttendee({
            bookingId: String(data.bookingId),
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            ticketCode,
        });
    }

    // UPDATE ATTENDEE
    static async updateAttendee(
        id: string,
        data: Partial<{
            firstName: string;
            lastName: string;
            email: string;
            phone: string;
        }>
    ) {
        // Check if attendee exists
        const exists = await BookingAttendeeRepo.attendeeExists(String(id));
        if (!exists) {
            throw new Error("Attendee not found");
        }

        return BookingAttendeeRepo.updateAttendee(String(id), data);
    }

    // CHECK IN ATTENDEE
    static async checkInAttendee(id: string) {
        // Check if attendee exists
        const exists = await BookingAttendeeRepo.attendeeExists(String(id));
        if (!exists) {
            throw new Error("Attendee not found");
        }

        return BookingAttendeeRepo.checkInAttendee(String(id));
    }

    // CHECK IN BY TICKET CODE
    static async checkInByTicketCode(ticketCode: string) {
        const exists = await BookingAttendeeRepo.ticketCodeExists(ticketCode);
        if (!exists) {
            throw new Error("Invalid ticket code");
        }

        return BookingAttendeeRepo.checkInByTicketCode(ticketCode);
    }

    // DELETE ATTENDEE
    static async deleteAttendee(id: string) {
        // Check if attendee exists
        const exists = await BookingAttendeeRepo.attendeeExists(String(id));
        if (!exists) {
            throw new Error("Attendee not found");
        }

        return BookingAttendeeRepo.deleteAttendee(String(id));
    }

    // GET BOOKING ATTENDEES
    static async getBookingAttendees(bookingId: string) {
        return BookingAttendeeRepo.getBookingAttendees(String(bookingId));
    }

    // GET EVENT ATTENDEES
    static async getEventAttendees(eventId: string) {
        return BookingAttendeeRepo.getEventAttendees(String(eventId));
    }
}
