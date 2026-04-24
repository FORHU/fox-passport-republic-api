import BookingRepo from "../repositories/booking.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import crypto from "crypto";

export default class BookingSvc {
    static async createBooking(data: any) {
        // Fetch event details to get start/end times
        const event = await EventRequestRepo.findById(data.eventId);
        if (!event) throw new Error("Event not found");

        const { attendees, eventId, userId, ...rest } = data;

        const attendeesWithTickets = (attendees || []).map((a: any) => ({
            ...a,
            ticketCode: `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
        }));
        
        return BookingRepo.create({
            ...rest,
            startAt: event.startAt,
            endAt: event.endAt,
            event: { connect: { id: eventId } },
            user: { connect: { id: userId } },
            attendees: { create: attendeesWithTickets }
        });
    }

    static async getAllBookings(filters: any) {
        return BookingRepo.findAll(filters);
    }

    static async getBookingById(id: string) {
        const booking = await BookingRepo.findById(id);
        if (!booking) throw new Error("Booking not found");
        return booking;
    }

    static async getUserBookings(userId: string) {
        return BookingRepo.findByUserId(userId);
    }
}
