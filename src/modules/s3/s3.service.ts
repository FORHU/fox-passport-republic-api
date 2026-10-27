import crypto from "crypto";
import sharp from "sharp";
import {
  getPutObjectPresignedUrl,
  getGetObjectPresignedUrl,
  uploadToS3,
  uploadPrivateToS3,
  headObject,
  readObjectHead,
  deleteObject,
} from "../../utils/s3";
import {
  checkUpload,
  formatForMime,
  acceptedMimeTypes,
  fileTooLarge,
  FILE_EMPTY,
  FILE_UNSUPPORTED,
  IMAGE_UNREADABLE,
  MAX_UPLOAD_SIZE,
  type DetectedFile,
} from "../../utils/file-signature";
import { badRequest, notFound } from "../../utils/errors";

const MAX_IMAGE_DIMENSION = 1600;
// Identity documents: big enough to read an ID number or a seal.
const DOCUMENT_IMAGE_DIMENSION = 2400;
const IMAGE_QUALITY = 80;

/**
 * Resizes to fit within MAX_IMAGE_DIMENSION (never upscales — `withoutEnlargement`)
 * and re-encodes as WebP. A phone-camera photo or an unedited screenshot easily
 * runs 3-8MB at full resolution; this routinely gets that under 300KB, which is
 * the difference between a feed/chat that loads fast on mobile data and one
 * that doesn't, since every upload path here stored the raw buffer as-is.
 */
async function optimizeImage(
  buffer: Buffer,
  maxDimension = MAX_IMAGE_DIMENSION,
): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // apply EXIF orientation before stripping metadata below
    .resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_QUALITY })
    .toBuffer();
}

/**
 * An image's bytes as they will be stored. Still images are re-encoded to
 * WebP; GIFs are kept as they are (re-encoding would drop the animation) but
 * still decoded, so a file that only starts like a GIF is turned away. One
 * that can't be decoded is refused — storing it anyway is how a renamed
 * executable or an empty file used to get through.
 */
async function prepareImage(
  buffer: Buffer,
  detected: DetectedFile,
  maxDimension: number,
): Promise<{ body: Buffer; contentType: string; ext: string }> {
  try {
    if (detected.ext === "gif") {
      await sharp(buffer, { animated: true }).metadata();
      return { body: buffer, contentType: detected.mime, ext: detected.ext };
    }
    return {
      body: await optimizeImage(buffer, maxDimension),
      contentType: "image/webp",
      ext: "webp",
    };
  } catch {
    throw badRequest(IMAGE_UNREADABLE);
  }
}

export default class S3Svc {
  /**
   * A presigned PUT for one listing, venue or avatar image. The declared type
   * and size are checked here and signed into the URL; the bytes themselves
   * are checked once uploaded, by verifyUpload.
   */
  static async generateUploadUrl(
    userId: string,
    contentType: string,
    sizeOfFile: number,
  ) {
    const format = formatForMime(contentType);
    if (!format || !acceptedMimeTypes("image").includes(contentType)) {
      throw badRequest(FILE_UNSUPPORTED.image);
    }
    if (!(sizeOfFile > 0)) throw badRequest(FILE_EMPTY);
    if (sizeOfFile > MAX_UPLOAD_SIZE[format.kind]) {
      throw badRequest(fileTooLarge(format.kind));
    }

    const key = `${S3Svc.uploadPrefix(userId)}${crypto.randomUUID()}.${format.ext}`;

    const url = await getPutObjectPresignedUrl({
      key,
      contentType,
      contentLength: sizeOfFile,
    });

    return { url, key };
  }

  static async generateDownloadUrl(key: string) {
    const url = await getGetObjectPresignedUrl({
      key,
    });

    return { url, key };
  }

  /** Where a user's presigned uploads land; nobody can register another's. */
  static uploadPrefix(userId: string) {
    return `users/${userId}/uploads/`;
  }

  /**
   * Checks a presigned upload's actual bytes before it is registered as a
   * File. The browser PUT it straight to S3, so this is the first time the
   * server sees it; anything that is not a supported image is deleted.
   */
  static async verifyUpload(userId: string, key: string) {
    if (!key.startsWith(S3Svc.uploadPrefix(userId)) || key.includes("..")) {
      throw notFound("Upload");
    }
    let size: number;
    try {
      ({ size } = await headObject(key));
    } catch {
      throw notFound("Upload");
    }
    try {
      const head = size > 0 ? await readObjectHead(key) : Buffer.alloc(0);
      const detected = checkUpload(head, size, "image");
      const { url } = await S3Svc.generateDownloadUrl(key);
      return { url, contentType: detected.mime };
    } catch (err) {
      await deleteObject(key).catch((e) =>
        console.warn("[S3Svc] Could not delete a rejected upload:", e),
      );
      throw err;
    }
  }

  /** A post or chat attachment (image or video), checked from its bytes. */
  static async uploadFile(
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    const detected = checkUpload(file.buffer, file.size, "media");

    let body = file.buffer;
    let contentType = detected.mime;
    let outExt = detected.ext;
    if (detected.kind === "image") {
      ({
        body,
        contentType,
        ext: outExt,
      } = await prepareImage(file.buffer, detected, MAX_IMAGE_DIMENSION));
    }

    const key = `${S3Svc.uploadPrefix(userId)}${crypto.randomUUID()}.${outExt}`;

    await uploadToS3({
      key,
      body,
      contentType,
    });

    return { key, contentType };
  }

  /**
   * An identity document (ID, clearance, proof of funds) into the private
   * bucket. Images or PDFs only, checked from their bytes. Returns the
   * storage key, never a URL: readers get a short-lived link from
   * `getPrivateObjectUrl` instead.
   *
   * Images are still re-encoded — which also strips EXIF, GPS included — but
   * kept larger than feed photos so the small print on an ID stays legible.
   */
  static async uploadPrivateFile(
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    const detected = checkUpload(file.buffer, file.size, "document");

    let body = file.buffer;
    let contentType = detected.mime;
    let outExt = detected.ext;
    if (detected.kind === "image") {
      ({
        body,
        contentType,
        ext: outExt,
      } = await prepareImage(file.buffer, detected, DOCUMENT_IMAGE_DIMENSION));
    }

    const key = `users/${userId}/private/${crypto.randomUUID()}.${outExt}`;
    await uploadPrivateToS3({ key, body, contentType });
    return { key, contentType };
  }
}
