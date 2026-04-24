import FileRepo from "../repositories/file.repository";

export default class FileSvc {
  static async createFile(
    data: 
      { url: string; 
        name: string; 
        type: string; 
        uploadedBy: string; 
        venueId?: string; 
        assetId?: string; 
        serviceId?: string;
        roleRequestId?: string }) {
    return FileRepo.createFile({
      url: data.url,
      name: data.name,
      type: data.type,
      uploadedBy: data.uploadedBy,
      venueId: data.venueId ?? null,
      assetId: data.assetId ?? null,
      serviceId: data.serviceId ?? null,
      roleRequestId: data.roleRequestId ?? null,
    });
  }
}
