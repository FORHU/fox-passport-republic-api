import { TAnnouncement } from "../models/announcement.model";
import AnnouncementRepo from "../repositories/announcement.repository";

export default class AnnouncementSvc {
  static async createAnnouncement(data: TAnnouncement) {
    return await AnnouncementRepo.createAnnouncement(data);
  }
}
