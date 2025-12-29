import { Request, Response } from "express";
import Joi from "joi";
import BookingAttendeeSvc from "../services/bookingAttendee.service";

export default class BookingAttendeeController {
    // GET ALL ATTENDEES
    static async getAllAttendees(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().optional(),
                checkedIn: Joi.boolean().optional(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendees = await BookingAttendeeSvc.getAllAttendees(value);
            return res.status(200).json({
                success: true,
                count: attendees.length,
                data: attendees,
            });
        } catch (error: any) {
            console.error("Get all attendees error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch attendees",
            });
        }
    }

    // GET ATTENDEE BY ID
    static async getAttendeeById(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendee = await BookingAttendeeSvc.getAttendeeById(value.id);
            return res.status(200).json({
                success: true,
                data: attendee,
            });
        } catch (error: any) {
            console.error("Get attendee by ID error:", error);
            if (error.message === "Attendee not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch attendee",
            });
        }
    }

    // GET ATTENDEE BY TICKET CODE
    static async getAttendeeByTicketCode(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                ticketCode: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendee = await BookingAttendeeSvc.getAttendeeByTicketCode(value.ticketCode);
            return res.status(200).json({
                success: true,
                data: attendee,
            });
        } catch (error: any) {
            console.error("Get attendee by ticket code error:", error);
            if (error.message === "Attendee not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch attendee",
            });
        }
    }

    // CREATE ATTENDEE
    static async createAttendee(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().required(),
                firstName: Joi.string().min(2).max(100).required(),
                lastName: Joi.string().min(2).max(100).required(),
                email: Joi.string().email().required(),
                phone: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendee = await BookingAttendeeSvc.createAttendee(value);
            return res.status(201).json({
                success: true,
                message: "Attendee created successfully",
                data: attendee,
            });
        } catch (error: any) {
            console.error("Create attendee error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create attendee",
            });
        }
    }

    // UPDATE ATTENDEE
    static async updateAttendee(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                firstName: Joi.string().min(2).max(100).optional(),
                lastName: Joi.string().min(2).max(100).optional(),
                email: Joi.string().email().optional(),
                phone: Joi.string().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const attendee = await BookingAttendeeSvc.updateAttendee(params.id, body);

            return res.status(200).json({
                success: true,
                message: "Attendee updated successfully",
                data: attendee,
            });
        } catch (error: any) {
            console.error("Update attendee error:", error);
            if (error.message === "Attendee not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update attendee",
            });
        }
    }

    // CHECK IN ATTENDEE
    static async checkInAttendee(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendee = await BookingAttendeeSvc.checkInAttendee(value.id);

            return res.status(200).json({
                success: true,
                message: "Attendee checked in successfully",
                data: attendee,
            });
        } catch (error: any) {
            console.error("Check in attendee error:", error);
            if (error.message === "Attendee not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to check in attendee",
            });
        }
    }

    // CHECK IN BY TICKET CODE
    static async checkInByTicketCode(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                ticketCode: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendee = await BookingAttendeeSvc.checkInByTicketCode(value.ticketCode);

            return res.status(200).json({
                success: true,
                message: "Attendee checked in successfully",
                data: attendee,
            });
        } catch (error: any) {
            console.error("Check in by ticket code error:", error);
            if (error.message === "Invalid ticket code") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to check in attendee",
            });
        }
    }

    // DELETE ATTENDEE
    static async deleteAttendee(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            await BookingAttendeeSvc.deleteAttendee(value.id);

            return res.status(200).json({
                success: true,
                message: "Attendee deleted successfully",
            });
        } catch (error: any) {
            console.error("Delete attendee error:", error);
            if (error.message === "Attendee not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to delete attendee",
            });
        }
    }

    // GET BOOKING ATTENDEES
    static async getBookingAttendees(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendees = await BookingAttendeeSvc.getBookingAttendees(value.bookingId);
            return res.status(200).json({
                success: true,
                count: attendees.length,
                data: attendees,
            });
        } catch (error: any) {
            console.error("Get booking attendees error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch booking attendees",
            });
        }
    }

    // GET EVENT ATTENDEES
    static async getEventAttendees(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const attendees = await BookingAttendeeSvc.getEventAttendees(value.eventId);
            return res.status(200).json({
                success: true,
                count: attendees.length,
                data: attendees,
            });
        } catch (error: any) {
            console.error("Get event attendees error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch event attendees",
            });
        }
    }
}
