import { Request, Response } from "express";
import BookingSvc from "./booking.service";
import Joi from "joi";

export default class AttendeeCtrl {
  static async addGuest(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        userId: Joi.string().uuid().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const attendee = await BookingSvc.addAttendee(
        req.params.bookingId,
        value,
        req.user!.userId,
      );

      return res.status(201).json({ success: true, data: attendee });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async removeGuest(req: Request, res: Response) {
    try {
      await BookingSvc.removeAttendee(req.params.id, req.user!.userId);
      return res.status(200).json({ success: true, message: "Guest removed" });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async respondToInvite(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        status: Joi.string().valid("accepted", "declined").required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const attendee = await BookingSvc.respondToInvite(
        req.params.id,
        value.status,
        req.user?.userId,
      );

      return res.status(200).json({ success: true, data: attendee });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
