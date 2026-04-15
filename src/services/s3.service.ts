import crypto from "crypto";
import { getPutObjectPresignedUrl, getGetObjectPresignedUrl } from "../utils/s3";

export default class S3Svc {
  static async generateUploadUrl(
    userId: string,
    originalFilename: string,
    contentType?: string,
    sizeOfFile?: number,
  ) {
    const ext = (S3Svc.getFileExtension(originalFilename) || "bin").toLowerCase();

    const allowedImageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "ico", "webp"];
    if (!allowedImageExtensions.includes(ext)) {
      throw new Error("Only image files are allowed");
    }

    if (!sizeOfFile || sizeOfFile > 15 * 1024 * 1024) {
      throw new Error("Image file size must be 15MB or below");
    }

    const key = `users/${userId}/uploads/${crypto.randomUUID()}.${ext}`;

    const url = await getPutObjectPresignedUrl({
      key,
      contentType,
    });

    return { url, key };
  }

  static async generateDownloadUrl(
    key: string
  ) {
    const url = await getGetObjectPresignedUrl({
      key
    });

    return { url, key };
  }

  private static getFileExtension(filename: string): string | undefined {
    const parts = filename.split(".");
    if (parts.length < 2) return undefined;
    return parts.pop();
  }
}

