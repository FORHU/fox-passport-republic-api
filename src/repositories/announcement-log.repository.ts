import { TAnnouncementLog, MAnnouncementLog } from "../models/announcement-log.model";
import { getDB } from "../utils/mongo";

export default class AnnouncementLogRepo {
  static collection() {
    return getDB().collection("announcement-logs");
  }

  static async createAnnouncementLog(data: TAnnouncementLog) {
    return await this.collection().insertOne(new MAnnouncementLog(data));
  }
}
