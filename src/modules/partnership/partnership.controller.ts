import { Request, Response } from "express";
import { PartnershipSvc } from "./partnership.service";
import { AuthenticatedUser } from "../../types/auth";

export class PartnershipController {
  static async createProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const data = req.body;

      const proposal = await PartnershipSvc.createProposal(user.userId, data);
      res.status(201).json({ success: true, data: proposal });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getProposal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // Neither of these two routes sits behind `authenticate` (they're
      // public reads), so the viewer may be signed out — `computeActions`
      // treats an undefined viewerId as "no actions available", not a crash.
      const viewerId = (req.user as AuthenticatedUser | undefined)?.userId;
      const proposal = await PartnershipSvc.getProposal(id, viewerId);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async listProposals(req: Request, res: Response) {
    try {
      const { partnerId, targetEventId, targetVenueId } = req.query;
      const viewerId = (req.user as AuthenticatedUser | undefined)?.userId;
      const proposals = await PartnershipSvc.listProposals(
        {
          partnerId: partnerId as string,
          targetEventId: targetEventId as string,
          targetVenueId: targetVenueId as string,
        },
        viewerId,
      );
      res.status(200).json({ success: true, data: proposals });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async acceptProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const proposal = await PartnershipSvc.acceptProposal(id, user);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message.includes("Unauthorized") ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async rejectProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const proposal = await PartnershipSvc.rejectProposal(id, user);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message.includes("Unauthorized") ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async withdrawProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const proposal = await PartnershipSvc.withdrawProposal(id, user.userId);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message.includes("Unauthorized") ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }
}
