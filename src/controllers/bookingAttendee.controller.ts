import { Request, Response } from "express";
import BookingAttendeeSvc from "../services/bookingAttendee.service";
import Joi from "joi";

export default class BookingAttendeeCtrl {
    static async getAttendeeById(req: Request, res: Response) {
        try {
            const attendee = await BookingAttendeeSvc.getAttendeeById(req.params.id);
            if (!attendee) return res.status(404).json({ message: "Attendee not found" });
            return res.status(200).json({ success: true, data: attendee });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getAttendeeByTicketCode(req: Request, res: Response) {
        try {
            const attendee = await BookingAttendeeSvc.getAttendeeByTicketCode(req.params.ticketCode);
            if (!attendee) return res.status(404).json({ message: "Attendee not found" });
            return res.status(200).json({ success: true, data: attendee });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getBookingAttendees(req: Request, res: Response) {
        try {
            const attendees = await BookingAttendeeSvc.getBookingAttendees(req.params.bookingId);
            return res.status(200).json({ success: true, data: attendees });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // UPDATED: Get Event Attendees
    static async getEventAttendees(req: Request, res: Response) {
        try {
            const attendees = await BookingAttendeeSvc.getEventAttendees(req.params.eventId);
            return res.status(200).json({ success: true, data: attendees });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async createAttendee(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                bookingId: Joi.string().uuid().required(),
                firstName: Joi.string().required(),
                lastName: Joi.string().required(),
                email: Joi.string().email().optional(),
                phone: Joi.string().optional(),
                ticketCode: Joi.string().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const attendee = await BookingAttendeeSvc.createAttendee(value);
            return res.status(201).json({ success: true, data: attendee });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async updateAttendee(req: Request, res: Response) {
        try {
            const attendee = await BookingAttendeeSvc.updateAttendee(req.params.id, req.body);
            return res.status(200).json({ success: true, data: attendee });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async calculateCheckInMismatch(req: Request, res: Response) {
        // Placeholder
        return res.status(200).json({ success: true, message: "Not implemented" });
    }

    static async checkInAttendee(req: Request, res: Response) {
        try {
            const attendee = await BookingAttendeeSvc.checkInAttendee(req.params.id);
            return res.status(200).json({ success: true, data: attendee });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async checkInByTicketCode(req: Request, res: Response) {
        try {
            const { ticketCode } = req.body;
            // Logic to find by ticket code and then check in
            // For now, simple return
            return res.status(501).json({ message: "Not implemented via this endpoint yet" });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async deleteAttendee(req: Request, res: Response) {
        try {
            await BookingAttendeeSvc.deleteAttendee(req.params.id);
            return res.status(200).json({ success: true, message: "Deleted" });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // Alias for backward compatibility if needed, but better to remove
    static async getListingAttendees(req: Request, res: Response) {
        return BookingAttendeeCtrl.getEventAttendees(req, res);
    }
}
