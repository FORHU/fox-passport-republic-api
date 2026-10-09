import { prisma } from "../../utils/prisma";

export default class FileRepo {
  static async createFile(data: {
    url: string;
    name: string;
    type: string;
    uploadedBy: string;
    venueId: string | null;
    assetId: string | null;
    serviceId: string | null;
  }) {
    return prisma.file.create({
      data: {
        url: data.url,
        name: data.name,
        type: data.type,
        uploadedBy: data.uploadedBy,
        venueId: data.venueId ?? null,
        assetId: data.assetId ?? null,
        serviceId: data.serviceId ?? null,
      },
    });
  }

  static async createPrivateFile(data: {
    storageKey: string;
    name: string;
    type: string;
    uploadedBy: string;
  }) {
    return prisma.file.create({
      data: { ...data, url: "", isPrivate: true },
      select: { id: true, name: true, type: true },
    });
  }
}
