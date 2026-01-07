import { Request, Response } from "express";
import Joi from "joi";
import BookingSvc from "../services/booking.service";

export default class BookingController {
    // GET ALL BOOKINGS
    static async getAllBookings(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().optional(),
                listingId: Joi.string().uuid().optional(),
                bookingStatus: Joi.string().optional(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const bookings = await BookingSvc.getAllBookings(value);
            return res.status(200).json({
                success: true,
                count: bookings.length,
                data: bookings,
            });
        } catch (error: any) {
            console.error("Get all bookings error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch bookings",
            });
        }
    }

    // GET BOOKING BY ID
    static async getBookingById(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const booking = await BookingSvc.getBookingById(value.id);
            return res.status(200).json({
                success: true,
                data: booking,
            });
        } catch (error: any) {
            console.error("Get booking by ID error:", error);
            if (error.message === "Booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking",
            });
        }
    }

    // GET BOOKING BY CONFIRMATION CODE
    static async getBookingByConfirmationCode(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                code: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const booking = await BookingSvc.getBookingByConfirmationCode(value.code);
            return res.status(200).json({
                success: true,
                data: booking,
            });
        } catch (error: any) {
            console.error("Get booking by confirmation code error:", error);
            if (error.message === "Booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking",
            });
        }
    }

    // ========== MULTI-STEP BOOKING ENDPOINTS ==========

    // STEP 1: CREATE DRAFT BOOKING
    static async createDraftBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                listingId: Joi.string().uuid().required(),
                userId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const draft = await BookingSvc.createDraftBooking(value);
            return res.status(201).json({
                success: true,
                message: "Draft booking created. Please complete the remaining steps.",
                data: draft,
                nextStep: 2,
            });
        } catch (error: any) {
            console.error("Create draft booking error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create draft booking",
            });
        }
    }

    // STEP 2: UPDATE TICKETS
    static async updateDraftTickets(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                guestCount: Joi.number().integer().min(1).required(),
                totalAmount: Joi.number().min(0).required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const booking = await BookingSvc.updateDraftTickets(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Tickets updated successfully",
                data: booking,
                nextStep: 3,
            });
        } catch (error: any) {
            console.error("Update draft tickets error:", error);
            if (error.message === "Draft booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized") || error.message.includes("expired")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update tickets",
            });
        }
    }

    // STEP 3: UPDATE CUSTOMER INFO
    static async updateDraftCustomerInfo(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                specialRequests: Joi.string().max(500).optional().allow(''),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const booking = await BookingSvc.updateDraftCustomerInfo(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Customer information updated successfully",
                data: booking,
                nextStep: 4,
            });
        } catch (error: any) {
            console.error("Update customer info error:", error);
            if (error.message === "Draft booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized") || error.message.includes("expired")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update customer info",
            });
        }
    }

    // STEP 4: CONFIRM BOOKING
    static async confirmDraftBooking(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const booking = await BookingSvc.confirmDraftBooking(params.id, body.userId);

            return res.status(200).json({
                success: true,
                message: "Booking confirmed successfully! Payment pending.",
                data: booking,
            });
        } catch (error: any) {
            console.error("Confirm booking error:", error);
            if (error.message === "Draft booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized") ||
                error.message.includes("expired") ||
                error.message.includes("required")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to confirm booking",
            });
        }
    }

    // ========== SINGLE-STEP BOOKING (Legacy) ==========

    // CREATE BOOKING
    static async createBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                listingId: Joi.string().uuid().required(),
                userId: Joi.string().uuid().required(),
                guestCount: Joi.number().integer().min(1).required(),
                totalAmount: Joi.number().min(0).required(),
                bookingStatus: Joi.string().valid("draft", "pending", "confirmed", "cancelled", "completed").optional(),
                specialRequests: Joi.string().max(500).optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const booking = await BookingSvc.createBooking(value);
            return res.status(201).json({
                success: true,
                message: "Booking created successfully",
                data: booking,
            });
        } catch (error: any) {
            console.error("Create booking error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create booking",
            });
        }
    }

    // UPDATE BOOKING
    static async updateBooking(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                guestCount: Joi.number().integer().min(1).optional(),
                totalAmount: Joi.number().min(0).optional(),
                bookingStatus: Joi.string().valid("draft", "pending", "confirmed", "cancelled", "completed").optional(),
                specialRequests: Joi.string().max(500).optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const booking = await BookingSvc.updateBooking(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Booking updated successfully",
                data: booking,
            });
        } catch (error: any) {
            console.error("Update booking error:", error);
            if (error.message === "Booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update booking",
            });
        }
    }

    // DELETE BOOKING
    static async deleteBooking(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            await BookingSvc.deleteBooking(params.id, body.userId);

            return res.status(200).json({
                success: true,
                message: "Booking cancelled successfully",
            });
        } catch (error: any) {
            console.error("Delete booking error:", error);
            if (error.message === "Booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to cancel booking",
            });
        }
    }

    // GET USER BOOKINGS
    static async getUserBookings(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const bookings = await BookingSvc.getUserBookings(value.userId);
            return res.status(200).json({
                success: true,
                count: bookings.length,
                data: bookings,
            });
        } catch (error: any) {
            console.error("Get user bookings error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch user bookings",
            });
        }
    }

    // GET LISTING BOOKINGS
    static async getListingBookings(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                listingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const querySchema = Joi.object({
                userId: Joi.string().uuid().required(), // For authorization
            });

            const { error: queryError, value: query } = querySchema.validate(req.query);
            if (queryError) {
                return res.status(400).json({ message: queryError.message });
            }

            const bookings = await BookingSvc.getListingBookings(params.listingId, query.userId);
            return res.status(200).json({
                success: true,
                count: bookings.length,
                data: bookings,
            });
        } catch (error: any) {
            console.error("Get listing bookings error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch listing bookings",
            });
        }
    }
}