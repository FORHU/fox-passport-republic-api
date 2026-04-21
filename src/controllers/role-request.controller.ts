import { Request, Response } from "express";
import RoleRequestService from "../services/role-request.service";
import { RequestStatus, RoleType } from "@prisma/client";

export default class RoleRequestController {
  /**
   * Submit an application for a role
   */
  static async apply(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { roleType, data } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (!roleType || !Object.values(RoleType).includes(roleType)) {
        return res.status(400).json({ success: false, message: "Invalid role type" });
      }

      const application = await RoleRequestService.submitApplication(userId, roleType, data);

      return res.status(201).json({
        success: true,
        message: `Application for ${roleType} submitted successfully`,
        data: application,
      });
    } catch (error: any) {
      console.error("Application error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin: List all applications
   */
  static async list(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const requests = await RoleRequestService.getRequests(status as RequestStatus);

      return res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin: Review an application
   */
  static async review(req: Request, res: Response) {
    try {
      const adminId = (req as any).user?.userId;
      const { id } = req.params;
      const { status, rejectionReason } = req.body;

      if (!id) return res.status(400).json({ success: false, message: "Request ID required" });
      if (![RequestStatus.approved, RequestStatus.rejected].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const updatedRequest = await RoleRequestService.reviewApplication(
        id,
        adminId,
        status,
        rejectionReason
      );

      return res.status(200).json({
        success: true,
        message: `Application ${status} successfully`,
        data: updatedRequest,
      });
    } catch (error: any) {
      console.error("Review error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
