import BookingRepo from "../repositories/booking.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import PaymentSvc from "./payment.service";
import PaymentRepo from "../repositories/payment.repository";
import PayoutSvc from "./payout.service";
import { prisma } from "../utils/prisma";
import crypto from "crypto";
import { BookingStatus, PaymentType, ItemBookingStatus } from "@prisma/client";

export default class BookingSvc {
    static async createBooking(data: any) {
        const { attendees, eventId, venueId, startDate, endDate, userId, ...rest } = data;

        // ── Venue direct booking path ────────────────────────────────────────
        if (venueId && !eventId) {
            const venue = await prisma.venue.findUnique({
                where: { id: venueId },
                include: { mayor: true },
            });
            if (!venue) throw new Error("Venue not found");

            const startAt = new Date(startDate);
            const endAt = new Date(endDate);
            const days = Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60 * 24)));
            const rateMultiplier =
                venue.billingRate === "hourly" ? days * 24 :
                venue.billingRate === "daily" ? days :
                venue.billingRate === "weekly" ? Math.ceil(days / 7) :
                venue.billingRate === "monthly" ? Math.ceil(days / 30) :
                1;
            const itemsTotal = venue.price * rateMultiplier;
            const platformFeeAmount = Math.round(itemsTotal * 0.05 * 100) / 100;
            const totalAmount = data.totalAmount || itemsTotal + platformFeeAmount;

            // Create a minimal Event (no template — direct venue booking)
            const event = await prisma.event.create({
                data: {
                    clientId: userId,
                    organizerId: venue.mayorId,
                    name: `${venue.name} Booking`,
                    description: venue.description,
                    eventCategory: "other" as any,
                    startAt,
                    endAt,
                    guestCount: data.guestCount || 1,
                    totalAmount,
                    itemsTotal,
                    hostMarkupAmount: 0,
                    platformFeeAmount,
                    requestStatus: "approved",
                    eventStatus: "pending",
                    targetCity: venue.city,
                    targetState: venue.state,
                    targetCountry: venue.country,
                },
            });

            // Create EventVenueTransaction
            await prisma.eventVenueTransaction.create({
                data: {
                    eventId: event.id,
                    venueId: venue.id,
                    providerId: venue.mayorId,
                    agreedPrice: itemsTotal,
                    status: "pending",
                    currency: "PHP",
                },
            });

            // Create Booking
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            const { specialRequests, ...bookingData } = rest;

            const booking = await BookingRepo.create({
                ...bookingData,
                totalAmount,
                startAt,
                endAt,
                expiresAt,
                event: { connect: { id: event.id } },
                user: { connect: { id: userId } },
            });

            await PaymentSvc.createPayment({
                bookingId: booking.id,
                amount: totalAmount,
                currency: data.currency || "PHP",
                method: "pending",
                paymentType: "full",
                expiresAt,
            });

            return booking;
        }

        // ── Existing event-based booking path ────────────────────────────────
        const event = await EventRequestRepo.findById(data.eventId);
        if (!event) throw new Error("Event not found");

        const attendeesWithTickets = (attendees || []).map((a: any) => ({
            ...a,
            invitedById: userId,
            isDraft: true,
            ticketCode: `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
        }));
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const totalAmount = data.totalAmount || 0;

        const { specialRequests: _, ...cleanRest } = rest;

        const booking = await BookingRepo.create({
            ...cleanRest,
            totalAmount,
            startAt: event.startAt,
            endAt: event.endAt,
            expiresAt,
            event: { connect: { id: eventId } },
            user: { connect: { id: userId } },
            attendees: { create: attendeesWithTickets }
        });

        await PaymentSvc.createPayment({
            bookingId: booking.id,
            amount: totalAmount,
            currency: data.currency || "PHP",
            method: "pending",
            paymentType: "full",
            expiresAt,
        });

        return booking;
    }

    static async getAllBookings(filters: any, page = 1, limit = 10) {
        await PaymentRepo.cancelExpiredPayments();
        const skip = (page - 1) * limit;
        return BookingRepo.findAll(filters, skip, limit);
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

    static async getUserBookings(userId: string, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        return BookingRepo.findByUserId(userId, skip, limit);
    }

    static async getUpcomingBookings(userId: string) {
        return BookingRepo.findUpcomingByUserId(userId);
    }

    static async cancelBooking(id: string, requesterId: string) {
        return this.updateStatus(id, "cancelled", requesterId);
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
