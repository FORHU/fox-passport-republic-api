import { Request, Response } from "express";
import Joi from "joi";
import BiddingSvc from "./bidding.service";

export default class BiddingCtrl {
  static async getOpenSlots(req: Request, res: Response) {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const slots = await BiddingSvc.getOpenSlots(categoryId);
      res.status(200).json({ success: true, data: slots });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async submitServiceBid(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        eventId: Joi.string().required(),
        proposedServiceId: Joi.string().required(),
        proposedPrice: Joi.number().min(0).required(),
        message: Joi.string().allow("").optional(),
        eventTemplateServiceId: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const bid = await BiddingSvc.submitServiceBid({
        ...value,
        providerId: req.user!.userId,
      });

      res.status(201).json({ success: true, data: bid });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async acceptServiceBid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await BiddingSvc.acceptServiceBid(id, req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async rejectServiceBid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await BiddingSvc.rejectServiceBid(id, req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getServiceBidsForEvent(req: Request, res: Response) {
    try {
      const { eventId } = req.params;
      const bids = await BiddingSvc.getServiceBidsForEvent(
        eventId,
        req.user!.userId,
      );
      res.status(200).json({ success: true, data: bids });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // --- Asset Bids ---

  static async submitAssetBid(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        eventId: Joi.string().required(),
        proposedAssetId: Joi.string().required(),
        proposedPrice: Joi.number().min(0).required(),
        message: Joi.string().allow("").optional(),
        eventTemplateAssetId: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const bid = await BiddingSvc.submitAssetBid({
        ...value,
        providerId: req.user!.userId,
      });

      res.status(201).json({ success: true, data: bid });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async acceptAssetBid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await BiddingSvc.acceptAssetBid(id, req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async rejectAssetBid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await BiddingSvc.rejectAssetBid(id, req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getAssetBidsForEvent(req: Request, res: Response) {
    try {
      const { eventId } = req.params;
      const bids = await BiddingSvc.getAssetBidsForEvent(
        eventId,
        req.user!.userId,
      );
      res.status(200).json({ success: true, data: bids });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
