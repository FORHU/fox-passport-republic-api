import { Request, Response } from "express";
import Joi from "joi";
import VenueAffiliationSvc from "./venue-affiliation.service";

const decisionStatus = (message: string) =>
  message.includes("Unauthorized")
    ? 403
    : message.includes("not found")
      ? 404
      : 400;

export default class VenueAffiliationCtrl {
  static async apply(req: Request, res: Response) {
    const schema = Joi.object({ venueId: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const affiliation = await VenueAffiliationSvc.apply(
        value.venueId,
        req.user!.userId,
      );
      return res.status(201).json({ success: true, data: affiliation });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async invite(req: Request, res: Response) {
    const schema = Joi.object({
      venueId: Joi.string().required(),
      eventFoxerId: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const affiliation = await VenueAffiliationSvc.invite(
        value.venueId,
        value.eventFoxerId,
        req.user!.userId,
      );
      return res.status(201).json({ success: true, data: affiliation });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async approve(req: Request, res: Response) {
    try {
      const affiliation = await VenueAffiliationSvc.approve(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: affiliation });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async reject(req: Request, res: Response) {
    const schema = Joi.object({
      rejectionReason: Joi.string().allow("").optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const affiliation = await VenueAffiliationSvc.reject(
        req.params.id,
        req.user!.userId,
        value.rejectionReason,
      );
      return res.status(200).json({ success: true, data: affiliation });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async cancel(req: Request, res: Response) {
    try {
      const affiliation = await VenueAffiliationSvc.cancel(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: affiliation });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async revoke(req: Request, res: Response) {
    try {
      const affiliation = await VenueAffiliationSvc.revoke(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: affiliation });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async getMine(req: Request, res: Response) {
    try {
      const data = await VenueAffiliationSvc.getMine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getForVenue(req: Request, res: Response) {
    try {
      const data = await VenueAffiliationSvc.getForVenue(
        req.params.venueId,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (err: unknown) {
      const error = err as Error;
      return res
        .status(decisionStatus(error.message))
        .json({ success: false, message: error.message });
    }
  }
}
