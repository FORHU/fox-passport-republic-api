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

  static async getAnnouncements(query: any, page?: number, limit?: number, sort?: number) {
    const skip = (page - 1) * limit;

    const pipeline = [
      { $match: query },
      { $project: { attachment: 1, title: 1, description: 1, active: 1, target: 1 } },
      {
        $lookup: {
          from: "files",
          localField: "attachment",
          pipeline: [{ $project: { _id: 1, filename: 1, contentType: 1, path: 1 } }],
          foreignField: "_id",
          as: "attachment",
        },
      },
      { $set: { attachment: { $first: "$attachment" } } },
      { $sort: { _id: sort } },
      { $skip: skip },
      { $limit: limit },
    ];

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

  static async updateAnnouncement(query: any, data: TAnnouncement) {
    return await this.collection().updateOne(query, { $set: data });
  }
}
