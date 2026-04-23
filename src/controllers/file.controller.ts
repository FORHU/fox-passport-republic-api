import { Request, Response } from "express";
import Joi from "joi";
import FileSvc from "../services/file.service";

export default class FileCtrl {
  static async createFile(req: Request, res: Response) {
    const schema = Joi.object({
      url: Joi.string().uri().required(),
      name: Joi.string().min(1).required(),
      type: Joi.string().min(1).required(),
      venueId: Joi.string().uuid().optional(),
      assetId: Joi.string().uuid().optional(),
      serviceId: Joi.string().uuid().optional(),
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
