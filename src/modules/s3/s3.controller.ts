import { Request, Response } from "express";
import Joi from "joi";
import S3Svc from "./s3.service";
import { AppError } from "../../utils/errors";

class S3Controller {
  static async getPutUrl(req: Request, res: Response) {
    const userId = req.user?.userId as string;

    const { originalFilename, contentType, sizeOfFile } = req.body;

    // Shape only. Which types and sizes are allowed is S3Svc's call, so the
    // answer is a message a user can act on rather than Joi's wording.
    const schema = Joi.object({
      originalFilename: Joi.string().min(1).optional(),
      contentType: Joi.string().required(),
      sizeOfFile: Joi.number().required(),
    });

    const { error, value } = schema.validate({
      originalFilename,
      contentType,
      sizeOfFile,
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const result = await S3Svc.generateUploadUrl(
        userId,
        value.contentType,
        value.sizeOfFile,
      );

      return res.status(200).json(result);
    } catch (e: unknown) {
      if (e instanceof AppError) {
        return res.status(e.status).json({ message: e.message });
      }
      const err = e as Error;
      const message = err?.message || "Failed to generate presigned URL";
      return res.status(500).json({ message });
    }
  }

  static async getGetUrl(req: Request, res: Response) {
    const { key } = req.query;

    const schema = Joi.object({
      key: Joi.string().min(1).required(),
    });

    const { error, value } = schema.validate({
      key,
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const result = await S3Svc.generateDownloadUrl(value.key);

      return res.status(200).json(result);
    } catch (e: unknown) {
      const err = e as Error;
      const message = err?.message || "Failed to generate presigned URL";
      return res.status(500).json({ message });
    }
  }
}

export { S3Controller };
export default S3Controller;
