import multer from "multer";
import type { Request } from "express";

// Configure storage to use memory so we can upload the buffer to Supabase
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
    cb(new Error("Only images are allowed"));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
