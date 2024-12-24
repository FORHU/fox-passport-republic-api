import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import multer from "multer";

import FileSrvc from "../services/file.service";
import { uploadFileToS3 } from "../utils/aws";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
}
