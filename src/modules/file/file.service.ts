import FileRepo from "./file.repository";
import S3Svc from "../s3/s3.service";
import type { PrivateUploadPurpose } from "../../utils/file-signature";

export default class FileSvc {
  static async createFile(data: {
    url: string;
    name: string;
    type: string;
    uploadedBy: string;
    venueId?: string;
    assetId?: string;
    serviceId?: string;
  }) {
    return FileRepo.createFile({
      url: data.url,
      name: data.name,
      type: data.type,
      uploadedBy: data.uploadedBy,
      venueId: data.venueId ?? null,
      assetId: data.assetId ?? null,
      serviceId: data.serviceId ?? null,
    });
  }

  /**
   * Registers an image uploaded through a presigned URL, once S3Svc has
   * checked that its bytes are a supported image under the user's prefix.
   */
  static async registerUpload(userId: string, key: string, name: string) {
    const { url, contentType } = await S3Svc.verifyUpload(userId, key);
    return FileSvc.createFile({
      url,
      name,
      type: contentType,
      uploadedBy: userId,
    });
  }

  /**
   * Stores an identity document (or, with purpose `portfolio`, a portfolio /
   * resume) in the private bucket and registers it.
   * The record has no URL — see utils/private-files.ts for how it is read.
   */
  static async storePrivateDocument(
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    purpose: PrivateUploadPurpose = "document",
  ) {
    const { key, contentType } = await S3Svc.uploadPrivateFile(
      userId,
      file,
      purpose,
    );
    return FileRepo.createPrivateFile({
      storageKey: key,
      name: file.originalname,
      type: contentType,
      uploadedBy: userId,
    });
  }
}
