import { Request, Response } from "express";
import Joi from "joi";
import FileSvc from "../services/file.service";
import S3Svc from "../services/s3.service";

export default class FileCtrl {
  static async uploadDirect(req: Request, res: Response) {
    try {
      const file = req.file;
      const userId = (req as any).user?.userId;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 1. Upload to S3 from backend
      const { key } = await S3Svc.uploadFile(userId, file as any);

      // 2. Generate Public URL
      const { url } = await S3Svc.generateDownloadUrl(key);

      // 3. Register in DB
      const dbFile = await FileSvc.createFile({
        name: file.originalname,
        type: file.mimetype,
        url: url,
        uploadedBy: userId,
      });

      return res.status(201).json({
        success: true,
        message: "File uploaded and registered successfully",
        fileId: dbFile.id,
        key: key
      });
    } catch (error: any) {
      console.error("[FileCtrl] Upload error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async createFile(req: Request, res: Response) {
    const schema = Joi.object({
      url: Joi.string().uri().required(),
      name: Joi.string().min(1).required(),
      type: Joi.string().min(1).required(),
      venueId: Joi.string().uuid().optional(),
      assetId: Joi.string().uuid().optional(),
      serviceId: Joi.string().uuid().optional(),
      roleRequestId: Joi.string().uuid().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const uploadedBy = (req as any).user?.userId;
      if (!uploadedBy) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const file = await FileSvc.createFile({
        ...value,
        uploadedBy: String(uploadedBy),
      });
      return res.status(201).json({ message: "File created successfully", file });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to create file" });
    }
  }
}
