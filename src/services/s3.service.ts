import crypto from "crypto";
import {
  getPutObjectPresignedUrl,
  getGetObjectPresignedUrl,
  uploadToS3,
} from "../utils/s3";

export default class S3Svc {
  static async generateUploadUrl(
    userId: string,
    originalFilename: string,
    contentType?: string,
    sizeOfFile?: number,
  ) {
    const ext = (
      S3Svc.getFileExtension(originalFilename) || "bin"
    ).toLowerCase();

    const allowedExtensions = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "tiff",
      "ico",
      "webp",
      "pdf",
    ];
    if (!allowedExtensions.includes(ext)) {
      throw new Error("Only images and PDF files are allowed");
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

  static async generateDownloadUrl(key: string) {
    const url = await getGetObjectPresignedUrl({
      key,
    });

    return { url, key };
  }

  private static getFileExtension(filename: string): string | undefined {
    const parts = filename.split(".");
    if (parts.length < 2) return undefined;
    return parts.pop();
  }

  static async uploadFile(
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    const ext = (
      S3Svc.getFileExtension(file.originalname) || "bin"
    ).toLowerCase();

    const allowedExtensions = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "tiff",
      "ico",
      "webp",
      "pdf",
    ];
    if (!allowedExtensions.includes(ext)) {
      throw new Error("Only images and PDF files are allowed");
    }

    if (file.size > 15 * 1024 * 1024) {
      throw new Error("Image file size must be 15MB or below");
    }

    const key = `users/${userId}/uploads/${crypto.randomUUID()}.${ext}`;

    await uploadToS3({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    return { key };
  }
}
