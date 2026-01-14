import { Request, Response } from "express";
import BookingSvc from "../services/booking.service";
import Joi from "joi";

export default class BookingCtrl {
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
                userId: req.user!.id,
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

            const booking = await BookingSvc.createDraftBooking({
                userId: req.user!.id,
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
            const booking = await BookingSvc.getBookingById(req.params.id);
            return res.status(200).json({ success: true, data: booking });
        } catch (error: any) {
            return res.status(404).json({ success: false, message: error.message });
        }
    }

    // GET USER BOOKINGS
    static async getUserBookings(req: Request, res: Response) {
        try {
            const bookings = await BookingSvc.getUserBookings(req.user!.id);
            return res.status(200).json({ success: true, data: bookings });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}