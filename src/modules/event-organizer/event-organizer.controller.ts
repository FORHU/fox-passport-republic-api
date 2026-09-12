import { Request, Response } from "express";
import Joi from "joi";
import EventOrganizerService from "./event-organizer.service";
import { DELEGABLE_EVENT_PERMISSIONS } from "../../types/permissions";

function statusForError(message: string): number {
  if (message.includes("not found")) return 404;
  if (message.startsWith("Unauthorized")) return 403;
  return 400;
}

export default class EventOrganizerController {
  static async list(req: Request, res: Response) {
    try {
      const { userId, systemRole } = req.user!;
      const organizers = await EventOrganizerService.list(
        req.params.eventId,
        userId,
        systemRole,
      );
      return res.status(200).json({ success: true, data: organizers });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async assign(req: Request, res: Response) {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      permissions: Joi.array()
        .items(Joi.string().valid(...DELEGABLE_EVENT_PERMISSIONS))
        .optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const { userId, systemRole } = req.user!;
      const assignment = await EventOrganizerService.assign(
        req.params.eventId,
        userId,
        systemRole,
        value.email,
        value.permissions,
      );
      return res.status(201).json({ success: true, data: assignment });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const { userId, systemRole } = req.user!;
      await EventOrganizerService.remove(
        req.params.eventId,
        userId,
        systemRole,
        req.params.userId,
      );
      return res.status(204).send();
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }
}
