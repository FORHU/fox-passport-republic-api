import FileRepo from "../repositories/file.repository";

export default class FileSvc {
  static async createFile(data: { url: string; name: string; type: string }) {
    return FileRepo.createFile(data);
  }
}
