import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import multer from "multer";
import { pipeline, Readable } from "stream";
import { promisify } from "util";

import FileSrvc from "../services/file.service";
import { downloadFiletoS3, uploadFileToS3 } from "../utils/aws";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
const storage = multer.memoryStorage();
const upload = multer({ storage });
import { IncomingMessage } from "http";

const streamPipeline = promisify(pipeline);

export default class KeywordCtrl {
  static async uploadFile(req: Request, res: Response) {
    try {
      upload.single("file")(req, res, async (err: any) => {
        if (err) {
          return handleErrorResponse(res, err, { code: "FILE_UPLOAD_FAILED" });
        }

        if (!req.file) {
          return handleErrorResponse(res, "", { code: "NO_FILE_UPLOADED" });
        }

        const fileData = req.file;
        const fileUploaded = await uploadFileToS3(fileData);
        const result = await FileSrvc.createFiles({
          filename: fileData?.originalname,
          contentType: fileData.mimetype,
          size: fileData?.size,
          path: fileUploaded,
          uploadedBy: new ObjectId(req?.user?.id),
          description: req.body.description,
          origin: "DO",
        });

        return handleResponse(res, result, "UPLOADED_FILE_SUCCESSFULLY");
      });
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_UPLOAD_FILE_FAILED",
      });
    }
  }

  static async downloadFile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const file = await FileSrvc.getFileById(id);
      if (!file) {
        return handleErrorResponse(res, "", { code: "FILE_NOT_FOUND" });
      }

      try {
        const filename = file.filename;
        const fileStream = await downloadFiletoS3(file.path);

        const fileStreamTyped = fileStream as IncomingMessage;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", fileStreamTyped.headers["content-type"] || "application/octet-stream");

        if (fileStream instanceof Readable) {
          await streamPipeline(fileStream, res);
        } else {
          throw new Error("The file stream is not a valid Readable stream");
        }
      } catch (error) {
        console.error("Error downloading file:", error);
        res.status(500).json({ error: "Failed to download file" });
      }
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_DOWNLOAD_FILE_FAILED",
      });
    }
  }
}
