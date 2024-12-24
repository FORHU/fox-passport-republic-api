import { TFile } from "../models/file.model";
import FileRepo from "../repositories/files.repository";

export default class BookingSvc {
  static createFiles(data: TFile) {
    return FileRepo.createFiles(data);
  }

  static getFiles(ids: any) {
    return FileRepo.getFiles(ids);
  }

  static getFilesLocation(query: any, offset: number, limit: number) {
    return FileRepo.getFilesLocation(query, offset, limit);
  }

  static countFiles(query: any) {
    return FileRepo.countFiles(query);
  }

  static updateFiles(query: Partial<TFile>, data: any) {
    return FileRepo.updateFiles(query, data);
  }
}
