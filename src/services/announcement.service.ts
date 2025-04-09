import { TAnnouncement } from "../models/announcement.model";
import AnnouncementRepo from "../repositories/announcement.repository";
import { constructQuery } from "../utils/announcement/helpers";

export default class AnnouncementSvc {
  static async createAnnouncement(data: TAnnouncement) {
    return await AnnouncementRepo.createAnnouncement(data);
  }

  static async getAnnouncements(_query: any, page?: number, limit?: number, sort?: number) {
    const query = constructQuery(_query);
    return await AnnouncementRepo.getAnnouncements(query, page, limit, sort);
  }

  static async getAnnouncement(query: any) {
    return await AnnouncementRepo.getAnnouncement(query);
  }

  static async updateAnnouncement(query: any, data: TAnnouncement) {
    return await AnnouncementRepo.updateAnnouncement(query, data);
  }
}
