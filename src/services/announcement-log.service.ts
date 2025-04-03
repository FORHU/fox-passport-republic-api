import { TAnnouncementLog } from "../models/announcement-log.model";
import AnnouncementLogRepo from "../repositories/announcement-log.repository";
import { ObjectId } from "mongodb";

export default class AnnouncementLogSvc {
  static async createAnnouncementLog(data: TAnnouncementLog) {
    const { announcement, ..._data } = data;

    const formattedData = {
      ...(announcement && { announcement: new ObjectId(announcement) }),
      ..._data,
    };

    return await AnnouncementLogRepo.createAnnouncementLog(formattedData);
  }
}
