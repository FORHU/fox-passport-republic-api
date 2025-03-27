import { ObjectId } from "mongodb";
import { TAnnouncement, MAnnouncement } from "../models/announcement.model";
import { getDB } from "../utils/mongo";

export default class AnnouncementRepo {
  static collection() {
    return getDB().collection("announcements");
  }

  static async createAnnouncement(data: TAnnouncement) {
    return await this.collection().insertOne(new MAnnouncement(data));
  }
}
