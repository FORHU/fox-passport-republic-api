import BookingRepo from "../repositories/booking.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import PaymentSvc from "./payment.service";
import PaymentRepo from "../repositories/payment.repository";
import PayoutSvc from "./payout.service";
import crypto from "crypto";
import { BookingStatus, PaymentType, ItemBookingStatus } from "@prisma/client";

export default class BookingSvc {
    static async createBooking(data: any) {
        // Fetch event details to get start/end times
        const event = await EventRequestRepo.findById(data.eventId);
        if (!event) throw new Error("Event not found");

        const { attendees, eventId, userId, ...rest } = data;

        const attendeesWithTickets = (attendees || []).map((a: any) => ({
            ...a,
            invitedById: userId,
            isDraft: true,
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

    static async getBookingById(id: string, userContext?: any) {
        // Lazy cleanup
        await PaymentRepo.cancelExpiredPayments();
        const booking = await BookingRepo.findById(id);
        if (!booking) throw new Error("Booking not found");

        // Role-based visibility filtering
        const isOwner = booking.userId === userContext?.userId;
        const isHost = (booking.event as any)?.host?.id === userContext?.userId;
        const isAdmin = userContext?.systemRole === 'admin';

        if (isHost && !isAdmin && !isOwner) {
            // Host only sees finalized attendees
            booking.attendees = booking.attendees.filter(a => !a.isDraft);
        }

        return booking;
    }

    static async addAttendee(bookingId: string, data: any, inviterId: string) {
        const booking = await BookingRepo.findById(bookingId);
        if (!booking) throw new Error("Booking not found");
        if (booking.isGuestListLocked) throw new Error("Guest list is locked");

        // Check for duplicates
        if (data.email) {
            const existing = booking.attendees.find(a => a.email === data.email);
            if (existing) throw new Error("Guest with this email already invited");
        }

        return BookingRepo.addAttendee(bookingId, {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            userId: data.userId,
            invitedById: inviterId,
            isDraft: true,
            ticketCode: `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
        });
    }

    static async removeAttendee(attendeeId: string, userId: string) {
        const attendee = await BookingRepo.findAttendeeById(attendeeId);
        if (!attendee) throw new Error("Attendee not found");
        
        const booking = attendee.booking as any;
        if (booking.userId !== userId) throw new Error("Unauthorized");
        if (booking.isGuestListLocked) throw new Error("Guest list is locked");

        return BookingRepo.removeAttendee(attendeeId);
    }

    static async finalizeGuestList(bookingId: string, userId: string) {
        const booking = await BookingRepo.findById(bookingId);
        if (!booking) throw new Error("Booking not found");
        if (booking.userId !== userId) throw new Error("Unauthorized");

        await BookingRepo.finalizeAttendees(bookingId);
        return { message: "Guest list finalized and visible to host" };
    }

    static async respondToInvite(identifier: string, status: any, userId?: string) {
        let attendee = await BookingRepo.findAttendeeByTicketCode(identifier);
        if (!attendee) {
            attendee = await BookingRepo.findAttendeeById(identifier);
        }
        
        if (!attendee) throw new Error("Attendee not found");

        return BookingRepo.updateAttendee(attendee.id, {
            inviteStatus: status,
            userId: userId || undefined
        });
    }

    static async getUserBookings(userId: string) {
        return BookingRepo.findByUserId(userId);
    }

    // Mirrors asset-booking.service.ts's updateStatus/confirmArrival/dispute exactly,
    // giving the Event-flow Booking the same active/disputed lifecycle. This is also
    // the payout trigger point — see docs/adr/0002-stripe-connect-payouts.md.
    static async updateStatus(id: string, status: string, requesterId: string) {
        const booking = await BookingRepo.findById(id);
        if (!booking) throw new Error("Booking not found");

        const isOwner = booking.userId === requesterId;
        const isOrganizer = (booking.event as any)?.organizerId === requesterId;
        if (!isOwner && !isOrganizer) throw new Error("Unauthorized");

        const updated = await BookingRepo.updateStatus(id, status as ItemBookingStatus);

        if (status === ItemBookingStatus.completed) {
            // Payout failures must never fail the status-update response — log and move on.
            try {
                await PayoutSvc.createPayoutsForEventBooking(id);
            } catch (err) {
                console.error(`Payout failed for booking ${id}`, err);
            }
        }

        return updated;
    }

    static async confirmArrival(id: string, requesterId: string) {
        const booking = await BookingRepo.findById(id);
        if (!booking) throw new Error("Booking not found");
        if (booking.userId !== requesterId) throw new Error("Only the client can confirm arrival");
        if (!["confirmed", "pending"].includes(booking.status)) {
            throw new Error("Booking cannot be confirmed at this stage");
        }
        return BookingRepo.confirmArrival(id);
    }

    static async dispute(id: string, requesterId: string) {
        const booking = await BookingRepo.findById(id);
        if (!booking) throw new Error("Booking not found");
        if (booking.userId !== requesterId) throw new Error("Only the client can report a dispute");
        if (["completed", "cancelled", "disputed"].includes(booking.status)) {
            throw new Error("Booking cannot be disputed at this stage");
        }
        return BookingRepo.dispute(id);
    }
}
