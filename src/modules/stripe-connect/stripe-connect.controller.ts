import { Request, Response } from "express";
import StripeConnectSvc, {
  ONBOARDING_CLIENTS,
  type OnboardingClient,
} from "./stripe-connect.service";

export default class StripeConnectCtrl {
  static async createOnboardingLink(req: Request, res: Response) {
    // Optional `client`: "web" (default) or "mobile" (mobile#476). Only
    // these names are accepted; a URL is never taken from the request.
    const client: unknown = req.body?.client ?? "web";
    if (!ONBOARDING_CLIENTS.includes(client as OnboardingClient)) {
      return res.status(400).json({
        success: false,
        message: `client must be one of: ${ONBOARDING_CLIENTS.join(", ")}`,
      });
    }
    try {
      const userId = req.user!.userId;
      const result = await StripeConnectSvc.createOnboardingLink(
        userId,
        client as OnboardingClient,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async createAccountSession(req: Request, res: Response) {
    try {
      const result = await StripeConnectSvc.createAccountSession(
        req.user!.userId,
      );
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
