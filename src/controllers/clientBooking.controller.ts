import { Request, Response } from "express";
import Joi from "joi";
import BookingSvc from "../services/booking.service";

export default class ClientBookingController {
    // ========== PUBLIC CLIENT BOOKING ENDPOINTS ==========

    // GET AVAILABLE EVENTS FOR BOOKING
    static async getAvailableEvents(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                city: Joi.string().optional(),
                category: Joi.string().optional(),
                date: Joi.date().optional(),
                limit: Joi.number().integer().min(1).max(100).default(20),
                page: Joi.number().integer().min(1).default(1),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            // This would need an EventService method to get available events
            // For now, returning a placeholder response
            return res.status(200).json({
                success: true,
                message: "Available events retrieved successfully",
                data: {
                    events: [],
                    pagination: {
                        page: value.page,
                        limit: value.limit,
                        total: 0
                    }
                }
            });
        } catch (error: any) {
            console.error("Get available events error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch available events",
            });
        }
    }

    // ========== MULTI-STEP BOOKING FLOW (DISABLED) ==========
    // TODO: Implement multi-step booking flow

    /*
    // STEP 1: START BOOKING (CREATE DRAFT)
    static async startBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().uuid().required(),
                userId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            const draft = await BookingSvc.createDraftBooking(value);

            return res.status(201).json({
                success: true,
                message: "Booking started successfully",
                data: {
                    bookingId: draft.id,
                    confirmationCode: draft.confirmationCode,
                    currentStep: draft.currentStep,
                    expiresAt: draft.expiresAt,
                    event: draft.event,
                },
                nextStep: {
                    step: 2,
                    endpoint: `/api/client/bookings/${draft.id}/tickets`,
                    method: "POST"
                }
            });
        } catch (error: any) {
            console.error("Start booking error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to start booking",
            });
        }
    }

    // STEP 2: SELECT TICKETS
    static async selectTickets(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({
                    success: false,
                    message: paramsError.message
                });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                numberOfTickets: Joi.number().integer().min(1).max(10).required(),
                totalAmount: Joi.number().min(0).required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({
                    success: false,
                    message: bodyError.message
                });
            }

            const { userId, ...ticketData } = body;
            const booking = await BookingSvc.updateDraftTickets(
                params.bookingId,
                userId,
                ticketData
            );

            return res.status(200).json({
                success: true,
                message: "Tickets selected successfully",
                data: {
                    bookingId: booking.id,
                    numberOfTickets: booking.numberOfTickets,
                    totalAmount: booking.totalAmount,
                    currentStep: booking.currentStep,
                    expiresAt: booking.expiresAt,
                },
                nextStep: {
                    step: 3,
                    endpoint: `/api/client/bookings/${booking.id}/customer-info`,
                    method: "POST"
                }
            });
        } catch (error: any) {
            console.error("Select tickets error:", error);

            if (error.message.includes("expired")) {
                return res.status(410).json({
                    success: false,
                    message: "Your booking session has expired. Please start a new booking.",
                    error: "SESSION_EXPIRED"
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
                message: error.message || "Failed to select tickets",
            });
        }
    }

    // STEP 3: ADD CUSTOMER INFORMATION
    static async addCustomerInfo(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({
                    success: false,
                    message: paramsError.message
                });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                specialRequests: Joi.string().max(500).optional().allow(''),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({
                    success: false,
                    message: bodyError.message
                });
            }

            const { userId, ...customerData } = body;
            const booking = await BookingSvc.updateDraftCustomerInfo(
                params.bookingId,
                userId,
                customerData
            );

            return res.status(200).json({
                success: true,
                message: "Customer information added successfully",
                data: {
                    bookingId: booking.id,
                    specialRequests: booking.specialRequests,
                    currentStep: booking.currentStep,
                    expiresAt: booking.expiresAt,
                },
                nextStep: {
                    step: 4,
                    endpoint: `/api/client/bookings/${booking.id}/confirm`,
                    method: "POST"
                }
            });
        } catch (error: any) {
            console.error("Add customer info error:", error);

            if (error.message.includes("expired")) {
                return res.status(410).json({
                    success: false,
                    message: "Your booking session has expired. Please start a new booking.",
                    error: "SESSION_EXPIRED"
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || "Failed to add customer information",
            });
        }
    }

    // STEP 4: CONFIRM BOOKING
    static async confirmBooking(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({
                    success: false,
                    message: paramsError.message
                });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({
                    success: false,
                    message: bodyError.message
                });
            }

            const booking = await BookingSvc.confirmDraftBooking(
                params.bookingId,
                body.userId
            );

            return res.status(200).json({
                success: true,
                message: "Booking confirmed successfully!",
                data: {
                    bookingId: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    numberOfTickets: booking.numberOfTickets,
                    totalAmount: booking.totalAmount,
                    specialRequests: booking.specialRequests,
                    event: booking.event,
                    user: booking.user,
                },
                nextStep: {
                    step: 5,
                    message: "Proceed to payment",
                    endpoint: `/api/client/bookings/${booking.id}/payment`,
                    method: "POST"
                }
            });
        } catch (error: any) {
            console.error("Confirm booking error:", error);

            if (error.message.includes("expired")) {
                return res.status(410).json({
                    success: false,
                    message: "Your booking session has expired. Please start a new booking.",
                    error: "SESSION_EXPIRED"
                });
            }

            if (error.message.includes("required")) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                    error: "INCOMPLETE_BOOKING"
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || "Failed to confirm booking",
            });
        }
    }
    */

    // GET BOOKING DETAILS (for client to view their booking)
    static async getBookingDetails(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({
                    success: false,
                    message: paramsError.message
                });
            }

            const querySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: queryError, value: query } = querySchema.validate(req.query);
            if (queryError) {
                return res.status(400).json({
                    success: false,
                    message: queryError.message
                });
            }

            const booking = await BookingSvc.getBookingById(params.bookingId);

            // Verify user owns this booking
            if (booking.userId !== query.userId) {
                return res.status(403).json({
                    success: false,
                    message: "You don't have permission to view this booking",
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    id: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    numberOfTickets: booking.numberOfTickets,
                    totalAmount: booking.totalAmount,
                    specialRequests: booking.specialRequests,
                    createdAt: booking.createdAt,
                    event: {
                        id: booking.event.id,
                        title: booking.event.title,
                        description: booking.event.description,
                        details: booking.event.details,
                    }
                }
            });
        } catch (error: any) {
            console.error("Get booking details error:", error);

            if (error.message === "Booking not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking details",
            });
        }
    }

    // GET BOOKING BY CONFIRMATION CODE (for clients to lookup their booking)
    static async getBookingByCode(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                confirmationCode: Joi.string().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({
                    success: false,
                    message: paramsError.message
                });
            }

            const booking = await BookingSvc.getBookingByConfirmationCode(params.confirmationCode);

            return res.status(200).json({
                success: true,
                data: {
                    id: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    numberOfTickets: booking.numberOfTickets,
                    totalAmount: booking.totalAmount,
                    specialRequests: booking.specialRequests,
                    createdAt: booking.createdAt,
                    event: {
                        title: booking.event.title,
                        details: booking.event.details,
                    },
                    user: {
                        name: booking.user.name,
                        email: booking.user.email,
                    }
                }
            });
        } catch (error: any) {
            console.error("Get booking by code error:", error);

            if (error.message === "Booking not found") {
                return res.status(404).json({
                    success: false,
                    message: "No booking found with this confirmation code",
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking",
            });
        }
    }

    // CANCEL BOOKING (for clients)
    static async cancelBooking(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({
                    success: false,
                    message: paramsError.message
                });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                reason: Joi.string().max(500).optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({
                    success: false,
                    message: bodyError.message
                });
            }

            await BookingSvc.deleteBooking(params.bookingId, body.userId);

            return res.status(200).json({
                success: true,
                message: "Booking cancelled successfully",
            });
        } catch (error: any) {
            console.error("Cancel booking error:", error);

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

    // GET USER'S ALL BOOKINGS
    static async getMyBookings(req: Request, res: Response) {
        try {
            const querySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                status: Joi.string().valid('draft', 'pending', 'confirmed', 'cancelled', 'completed').optional(),
            });

            const { error, value } = querySchema.validate(req.query);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            const bookings = await BookingSvc.getUserBookings(value.userId);

            // Filter by status if provided
            const filteredBookings = value.status
                ? bookings.filter(b => b.bookingStatus === value.status)
                : bookings;

            return res.status(200).json({
                success: true,
                count: filteredBookings.length,
                data: filteredBookings.map(booking => ({
                    id: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    numberOfTickets: booking.numberOfTickets,
                    totalAmount: booking.totalAmount,
                    createdAt: booking.createdAt,
                    event: {
                        id: booking.event.id,
                        title: booking.event.title,
                        details: booking.event.details,
                    }
                }))
            });
        } catch (error: any) {
            console.error("Get my bookings error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch your bookings",
            });
        }
    }
}