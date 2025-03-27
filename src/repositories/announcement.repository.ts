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

  static async getAnnouncements(query: any, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const pipeline = [{ $match: query }, { $project: { attachment: 1, title: 1, description: 1, active: 1 } }, { $skip: skip }, { $limit: limit }];
    const total_documents = await this.collection().countDocuments(query);
    const result = await this.collection().aggregate(pipeline).toArray();

    return {
      data: result,
      total_documents,
      current_page: page,
      total_pages: Math.ceil(total_documents / limit),
    };
  }

  static async getAnnouncement(query: any) {
    return await this.collection().findOne(query);
  }
}
