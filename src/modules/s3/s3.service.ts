import crypto from "crypto";
import sharp from "sharp";
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

// GIFs are excluded — re-encoding through sharp's pipeline would collapse
// the animation to its first frame. Everything else (including already-webp)
// is safe to re-run through this: sharp is a no-op-ish pass-through cost-wise
// on an already-small image, and this keeps every upload well under what a
// phone camera or a screenshot actually produces.
const RESIZABLE_IMAGE_EXTENSIONS = IMAGE_EXTENSIONS.filter(
  (ext) => ext !== "gif",
);
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 80;

/**
 * Resizes to fit within MAX_IMAGE_DIMENSION (never upscales — `withoutEnlargement`)
 * and re-encodes as WebP. A phone-camera photo or an unedited screenshot easily
 * runs 3-8MB at full resolution; this routinely gets that under 300KB, which is
 * the difference between a feed/chat that loads fast on mobile data and one
 * that doesn't, since every upload path here stored the raw buffer as-is.
 */
async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // apply EXIF orientation before stripping metadata below
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_QUALITY })
    .toBuffer();
}

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

    let body = file.buffer;
    let contentType = file.mimetype;
    let outExt = ext;

    if (RESIZABLE_IMAGE_EXTENSIONS.includes(ext)) {
      try {
        body = await optimizeImage(file.buffer);
        contentType = "image/webp";
        outExt = "webp";
      } catch (err) {
        // A corrupt/unsupported image shouldn't block the upload outright —
        // fall back to storing the original buffer as before.
        console.warn(
          "[S3Svc] Image optimization failed, storing original:",
          err,
        );
      }
    }

    const key = `users/${userId}/uploads/${crypto.randomUUID()}.${outExt}`;

    await uploadToS3({
      key,
      body,
      contentType,
    });

    return { key, contentType };
  }
}
