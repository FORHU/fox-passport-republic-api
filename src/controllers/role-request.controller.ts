import { Request, Response } from "express";
import RoleRequestService from "../services/role-request.service";
import S3Svc from "../services/s3.service";
import FileSvc from "../services/file.service";
import { RequestStatus, RoleType } from "@prisma/client";

// Maps multer field names → application DB column names
const FILE_FIELD_TO_DB_COLUMN: Record<string, string> = {
  validId1: "validId1FileId",
  nbiFile: "nbiFileId",
  tinIdFile: "tinIdFileId",
  birPermitFile: "birPermitFileId",
  selfieFile: "selfieFileId",
  portfolioFile: "portfolioFileId",
};

export default class RoleRequestController {
  /**
   * Submit an application for a role
   * Accepts multipart/form-data with file uploads + JSON data
   */
  static async apply(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { roleType } = req.body;

      // `data` is sent as a JSON string in multipart form-data
      const data =
        typeof req.body.data === "string"
          ? JSON.parse(req.body.data)
          : req.body.data || {};

      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (!roleType || !Object.values(RoleType).includes(roleType)) {
        return res.status(400).json({ success: false, message: "Invalid role type" });
      }

      // Process each uploaded file through the 4-step pipeline
      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

      if (files) {
        for (const [fieldName, fileArray] of Object.entries(files)) {
          const file = fileArray[0];
          if (!file) continue;

          const dbColumn = FILE_FIELD_TO_DB_COLUMN[fieldName];
          if (!dbColumn) continue;

          // 1. GET URL TO UPLOAD — generate presigned PUT URL & S3 key
          //    (uploadFile handles this internally: generates key + uploads)

          // 2. UPLOAD THE FILE — upload file buffer to S3
          const { key } = await S3Svc.uploadFile(userId, file as any);

          // 3. GET CLOUDFRONT URL — get public URL for the uploaded file
          const { url } = await S3Svc.generateDownloadUrl(key);

          // 4. CREATE FILE — register file record in DB
          const dbFile = await FileSvc.createFile({
            name: file.originalname,
            type: file.mimetype,
            url,
            uploadedBy: userId,
          });

          // Inject the file ID into application data
          data[dbColumn] = dbFile.id;
        }
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
