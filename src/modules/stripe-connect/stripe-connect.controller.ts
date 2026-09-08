import { Request, Response } from "express";
import StripeConnectSvc from "./stripe-connect.service";

export default class StripeConnectCtrl {
  static async createOnboardingLink(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const result = await StripeConnectSvc.createOnboardingLink(userId);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getStatus(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const status = await StripeConnectSvc.getOnboardingStatus(userId);
      return res.status(200).json({ success: true, data: status });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
