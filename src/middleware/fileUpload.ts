import multer from "multer";
import type { Request } from "express";
import { badRequest } from "../utils/errors";
import { FILE_UNSUPPORTED } from "../utils/file-signature";

// Keep the file in memory so the buffer can be handed straight to S3.
const storage = multer.memoryStorage();

// Only accept images; anything else is rejected before it reaches a controller.
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(badRequest(FILE_UNSUPPORTED.image));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
