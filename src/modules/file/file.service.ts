import FileRepo from "./file.repository";
import S3Svc from "../s3/s3.service";

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
   * Stores an identity document in the private bucket and registers it.
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
  ) {
    const { key, contentType } = await S3Svc.uploadPrivateFile(userId, file);
    return FileRepo.createPrivateFile({
      storageKey: key,
      name: file.originalname,
      type: contentType,
      uploadedBy: userId,
    });
  }
}
