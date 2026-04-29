import { Request, Response } from "express";
import BookingSvc from "../services/booking.service";
import Joi from "joi";
import PaymentSvc from "../services/payment.service";
import { prisma } from "../utils/prisma";
import { PaymentStatus } from "@prisma/client";

export default class BookingCtrl {
    // BOOK FROM TEMPLATE — creates an Event + Booking in one shot for a logged-in client
    static async bookFromTemplate(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                templateId: Joi.string().required(),
                guestCount: Joi.number().integer().min(1).required(),
                totalAmount: Joi.number().min(0).required(),
                startAt: Joi.date().iso().required(),
                endAt: Joi.date().iso().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const template = await prisma.eventTemplate.findUnique({
                where: { id: value.templateId, isPublic: true },
            });
            if (!template) return res.status(404).json({ message: "Template not found or not approved" });

            // Create an Event record from the template (already approved)
            const event = await prisma.event.create({
                data: {
                    templateId: template.id,
                    clientId: req.user!.userId,
                    organizerId: template.ownerId,
                    name: template.name,
                    description: template.description ?? "",
                    eventCategory: template.category,
                    startAt: value.startAt,
                    endAt: value.endAt,
                    guestCount: value.guestCount,
                    totalAmount: value.totalAmount,
                    requestStatus: "approved",
                    eventStatus: "pending",
                    targetCity: template.targetCity ?? undefined,
                    targetState: template.targetState ?? undefined,
                    targetCountry: template.targetCountry ?? undefined,
                },
            });

            const booking = await BookingSvc.createBooking({
                userId: req.user!.userId,
                eventId: event.id,
                guestCount: value.guestCount,
                totalAmount: value.totalAmount,
            });

            return res.status(201).json({ success: true, data: { booking, eventId: event.id } });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // CREATE BOOKING
    static async createBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().uuid().required(),
                guestCount: Joi.number().integer().min(1).required(),
                totalAmount: Joi.number().min(0).required(),
                attendees: Joi.array().items(
                    Joi.object({
                        firstName: Joi.string().required(),
                        lastName: Joi.string().required(),
                        email: Joi.string().email().optional(),
                        phone: Joi.string().optional(),
                    })
                ).optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const booking = await BookingSvc.createBooking({
                userId: req.user!.userId,
                ...value,
            });

            return res.status(201).json({ success: true, data: booking });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // CREATE DRAFT (Step 1)
    static async createDraftBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().uuid().required(),
                guestCount: Joi.number().min(1).optional(),
                totalAmount: Joi.number().min(0).optional(),
                specialRequests: Joi.string().optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const booking = await BookingSvc.createBooking({
                userId: req.user!.userId,
                ...value
            });

            return res.status(201).json({ success: true, data: booking });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET ALL BOOKINGS
    static async getAllBookings(req: Request, res: Response) {
        try {
            // Simplified filters
            const bookings = await BookingSvc.getAllBookings(req.query);
            return res.status(200).json({ success: true, data: bookings });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET ONE
    static async getBookingById(req: Request, res: Response) {
        try {
            const booking = await BookingSvc.getBookingById(req.params.id, req.user);
            return res.status(200).json({ success: true, data: booking });
        } catch (error: any) {
            return res.status(404).json({ success: false, message: error.message });
        }
    }

    // FINALIZE GUESTS
    static async finalizeGuests(req: Request, res: Response) {
        try {
            const result = await BookingSvc.finalizeGuestList(req.params.id, req.user!.userId);
            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // GET USER BOOKINGS
    static async getUserBookings(req: Request, res: Response) {
        try {
            const bookings = await BookingSvc.getUserBookings(req.user!.userId);
            return res.status(200).json({ success: true, data: bookings });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // CONFIRM BOOKING AFTER STRIPE PAYMENT
    static async confirmBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                amount: Joi.number().min(0).required(),
                method: Joi.string().required(),
                transactionId: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const bookingId = req.params.id;

            const payment = await PaymentSvc.createPayment({
                bookingId,
                amount: value.amount,
                currency: "PHP",
                method: value.method,
                paymentType: "full",
                paymentStatus: PaymentStatus.completed,
                transactionId: value.transactionId,
            });

            const booking = await BookingSvc.getBookingById(bookingId, req.user);

            return res.status(200).json({ success: true, data: { booking, payment } });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // APPEND ATTENDEES IN BULK (PUT)
    static async appendAttendees(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                attendees: Joi.array().items(
                    Joi.object({
                        firstName: Joi.string().required(),
                        lastName: Joi.string().required(),
                        email: Joi.string().email().optional(),
                        phone: Joi.string().optional(),
                    })
                ).min(1).required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const bookingId = req.params.id;
            const results = [];
            for (const attendee of value.attendees) {
                const added = await BookingSvc.addAttendee(bookingId, attendee, req.user!.userId);
                results.push(added);
            }

            return res.status(200).json({ success: true, data: results });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}