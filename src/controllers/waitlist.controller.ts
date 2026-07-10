import { Request, Response } from "express";
import Joi from "joi";
import WaitlistSvc from "../services/waitlist.service";

export default class WaitlistCtrl {
  // POST /waitlist
  static async join(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        templateId: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const result = await WaitlistSvc.joinWaitlist(
        value.templateId,
        req.user!.userId,
      );
      return res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // DELETE /waitlist/:id
  static async leave(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        id: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.params);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      await WaitlistSvc.leaveWaitlist(value.id, req.user!.userId);
      return res
        .status(200)
        .json({ success: true, message: "Removed from waitlist" });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /waitlist?templateId=X
  static async getStatus(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        templateId: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.query);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const result = await WaitlistSvc.getWaitlistStatus(
        value.templateId,
        req.user?.userId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
