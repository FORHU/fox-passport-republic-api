import crypto from "crypto";
import {
  getPutObjectPresignedUrl,
  getGetObjectPresignedUrl,
  uploadToS3,
} from "../../utils/s3";

const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "ico",
  "webp",
];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v"];
const ALLOWED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, "pdf"];
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

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

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error("Only images, videos, and PDF files are allowed");
    }

    const maxSize = VIDEO_EXTENSIONS.includes(ext)
      ? MAX_VIDEO_SIZE
      : MAX_IMAGE_SIZE;
    if (!sizeOfFile || sizeOfFile > maxSize) {
      throw new Error(
        `File size must be ${maxSize / (1024 * 1024)}MB or below`,
      );
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

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error("Only images, videos, and PDF files are allowed");
    }

    const maxSize = VIDEO_EXTENSIONS.includes(ext)
      ? MAX_VIDEO_SIZE
      : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      throw new Error(
        `File size must be ${maxSize / (1024 * 1024)}MB or below`,
      );
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
