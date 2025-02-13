import { ObjectId } from "mongodb";

import { TFile } from "../models/file.model";
import FileRepo from "../repositories/files.repository";

export default class BookingSvc {
  static createFiles(data: TFile) {
    return FileRepo.createFiles(data);
  }

  static handleGetFiles(query: any) {
    return FileRepo.handleGetFiles(query);
  }

  static getFiles(ids: any) {
    return FileRepo.getFiles(ids);
  }

  static getFileById(id: string) {
    return FileRepo.getFileById(new ObjectId(id));
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

  static deleteFilesById(id: string) {
    return FileRepo.deleteFilesById(new ObjectId(id));
  }
}
