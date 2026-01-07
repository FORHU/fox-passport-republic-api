import { Request, Response } from "express";
import Joi from "joi";
import BookingSvc from "../services/booking.service";

export default class ClientBookingController {
    // ========== PUBLIC CLIENT BOOKING ENDPOINTS ==========

    // GET AVAILABLE LISTINGS FOR BOOKING
    static async getAvailableListings(req: Request, res: Response) {
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

            return res.status(200).json({
                success: true,
                message: "Available listings retrieved successfully",
                data: {
                    listings: [],
                    pagination: {
                        page: value.page,
                        limit: value.limit,
                        total: 0
                    }
                }
            });
        } catch (error: any) {
            console.error("Get available listings error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch available listings",
            });
        }
    }

    // STEP 1: START BOOKING (CREATE DRAFT)
    static async startBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                listingId: Joi.string().uuid().required(),
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
                    listing: draft.listing,
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
                guestCount: Joi.number().integer().min(1).max(10).required(),
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

            // PRICE VALIDATION
            const bookingForValidation = await BookingSvc.getBookingById(params.bookingId);
            const listing = bookingForValidation.listing;
            if (listing && listing.pricing && listing.pricing.length > 0) {
                const basePrice = listing.pricing[0].basePrice.toNumber();
                const expectedAmount = basePrice * body.guestCount;
                if (Math.abs(expectedAmount - body.totalAmount) > 0.01) {
                    return res.status(400).json({
                        success: false,
                        message: `Price mismatch. Expected ${expectedAmount}, got ${body.totalAmount}`
                    });
                }
            }

            const updatedBooking = await BookingSvc.updateDraftTickets(
                params.bookingId,
                userId,
                ticketData
            );

            return res.status(200).json({
                success: true,
                message: "Tickets selected successfully",
                data: {
                    bookingId: updatedBooking.id,
                    guestCount: updatedBooking.guestCount,
                    totalAmount: updatedBooking.totalAmount,
                    currentStep: updatedBooking.currentStep,
                    expiresAt: updatedBooking.expiresAt,
                },
                nextStep: {
                    step: 3,
                    endpoint: `/api/client/bookings/${updatedBooking.id}/attendees`,
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

    // STEP 3: ADD ATTENDEE INFORMATION
    static async addAttendees(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ success: false, message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                attendees: Joi.array().items(Joi.object({
                    firstName: Joi.string().required(),
                    lastName: Joi.string().required(),
                    email: Joi.string().email().required(),
                    phone: Joi.string().required(),
                })).min(1).required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ success: false, message: bodyError.message });
            }

            const attendees = await BookingSvc.addBookingAttendees(
                params.bookingId,
                body.userId,
                body.attendees
            );

            return res.status(201).json({
                success: true,
                message: "Attendee information added successfully",
                data: attendees,
                nextStep: {
                    step: 4,
                    endpoint: `/api/client/bookings/${params.bookingId}/customer-info`,
                    method: "POST"
                }
            });
        } catch (error: any) {
            console.error("Add attendees error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to add attendees",
            });
        }
    }

    // STEP 4: ADD CUSTOMER INFORMATION
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
                    step: 5,
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

    // STEP 5: CONFIRM BOOKING
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
                message: "Booking confirmed successfully! Please proceed to payment.",
                data: {
                    bookingId: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    guestCount: booking.guestCount,
                    totalAmount: booking.totalAmount,
                    specialRequests: booking.specialRequests,
                    listing: booking.listing,
                    user: booking.user,
                },
                nextStep: {
                    step: 6,
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

    // STEP 6: PROCESS PAYMENT
    static async processPayment(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ success: false, message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                amount: Joi.number().required(),
                currency: Joi.string().default("USD"),
                paymentMethod: Joi.string().required(),
                transactionId: Joi.string().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ success: false, message: bodyError.message });
            }

            const { userId, ...paymentData } = body;
            const payment = await BookingSvc.processBookingPayment(
                params.bookingId,
                userId,
                paymentData
            );

            return res.status(200).json({
                success: true,
                message: "Payment processed successfully. Your booking is now confirmed.",
                data: payment
            });
        } catch (error: any) {
            console.error("Process payment error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to process payment",
            });
        }
    }

    // GET BOOKING DETAILS
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
                    currentStep: booking.currentStep,
                    guestCount: booking.guestCount,
                    totalAmount: booking.totalAmount,
                    specialRequests: booking.specialRequests,
                    expiresAt: booking.expiresAt,
                    createdAt: booking.createdAt,
                    listing: {
                        id: booking.listing.id,
                        title: booking.listing.title,
                        description: booking.listing.description,
                        location: booking.listing.location,
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

    // GET MY BOOKINGS
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

            const filteredBookings = value.status
                ? bookings.filter((b: any) => b.bookingStatus === value.status)
                : bookings;

            return res.status(200).json({
                success: true,
                count: filteredBookings.length,
                data: filteredBookings.map((booking: any) => ({
                    id: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    guestCount: booking.guestCount,
                    totalAmount: booking.totalAmount,
                    createdAt: booking.createdAt,
                    listing: {
                        id: booking.listing.id,
                        title: booking.listing.title,
                        location: booking.listing.location,
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

    // GET BOOKING BY CODE
    static async getBookingByCode(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                confirmationCode: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            const booking = await BookingSvc.getBookingByConfirmationCode(value.confirmationCode);

            return res.status(200).json({
                success: true,
                data: {
                    id: booking.id,
                    confirmationCode: booking.confirmationCode,
                    bookingStatus: booking.bookingStatus,
                    guestCount: booking.guestCount,
                    totalAmount: booking.totalAmount,
                    listing: {
                        id: booking.listing.id,
                        title: booking.listing.title,
                        location: booking.listing.location,
                    }
                }
            });
        } catch (error: any) {
            console.error("Get booking by code error:", error);
            if (error.message === "Booking not found") {
                return res.status(404).json({ success: false, message: error.message });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking",
            });
        }
    }

    // CANCEL BOOKING
    static async cancelBooking(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ success: false, message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ success: false, message: bodyError.message });
            }

            await BookingSvc.deleteBooking(params.bookingId, body.userId);

            return res.status(200).json({
                success: true,
                message: "Booking cancelled successfully",
            });
        } catch (error: any) {
            console.error("Cancel booking error:", error);
            if (error.message === "Booking not found") {
                return res.status(404).json({ success: false, message: error.message });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({ success: false, message: error.message });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to cancel booking",
            });
        }
    }
}