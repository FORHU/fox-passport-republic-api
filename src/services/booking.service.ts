import BookingRepo from "../repositories/booking.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import PaymentSvc from "./payment.service";
import PaymentRepo from "../repositories/payment.repository";
import crypto from "crypto";
import { BookingStatus, PaymentType } from "@prisma/client";

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
        
        // Calculate expiration (24 hours from now)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Calculate 50% deposit
        const totalAmount = data.totalAmount || 0;
        const depositAmount = totalAmount * 0.5;

        const booking = await BookingRepo.create({
            ...rest,
            totalAmount,
            startAt: event.startAt,
            endAt: event.endAt,
            expiresAt,
            event: { connect: { id: eventId } },
            user: { connect: { id: userId } },
            attendees: { create: attendeesWithTickets }
        });

        // Automatically create the deposit payment record
        await PaymentSvc.createPayment({
            bookingId: booking.id,
            amount: depositAmount,
            currency: data.currency || "PHP",
            method: "pending", // Placeholder until user selects method
            paymentType: "deposit",
            expiresAt,
        });

        return booking;
    }

    static async getAllBookings(filters: any) {
        // Lazy cleanup before listing
        await PaymentRepo.cancelExpiredPayments();
        return BookingRepo.findAll(filters);
    }

    static async getBookingById(id: string) {
        // Lazy cleanup
        await PaymentRepo.cancelExpiredPayments();
        const booking = await BookingRepo.findById(id);
        if (!booking) throw new Error("Booking not found");
        return booking;
    }

    static async getUserBookings(userId: string) {
        return BookingRepo.findByUserId(userId);
    }
}
