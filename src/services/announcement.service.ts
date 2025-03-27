import { TAnnouncement } from "../models/announcement.model";
import AnnouncementRepo from "../repositories/announcement.repository";

export default class AnnouncementSvc {
  static async createAnnouncement(data: TAnnouncement) {
    return await AnnouncementRepo.createAnnouncement(data);
  }

  static async getAnnouncements(query: any, page: number, limit: number) {
    return await AnnouncementRepo.getAnnouncements(query, page, limit);
  }

  static async getAnnouncement(query: any) {
    return await AnnouncementRepo.getAnnouncement(query);
  }
}
