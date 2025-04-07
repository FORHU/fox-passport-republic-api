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
    const { "announcement_log.user": announcementLogUser, $text, ..._query } = query;

    const pipeline = [];

    if ($text) pipeline.push({ $match: { $text } });

    const sharedStages = [
      {
        $project: {
          attachment: 1,
          title: 1,
          description: 1,
          active: 1,
          target: 1,
          deletedAt: 1,
        },
      },
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
      {
        $lookup: {
          from: "announcement-logs",
          localField: "_id",
          foreignField: "announcement",
          pipeline: [{ $match: { user: announcementLogUser } }, { $project: { _id: 0, viewed: 1 } }],
          as: "viewed",
        },
      },
      {
        $set: {
          viewed: { $ifNull: [{ $first: "$viewed.viewed" }, false] },
        },
      },
      { $match: _query },
      { $unset: "deletedAt" },
    ];

    pipeline.push(...sharedStages, { $sort: { _id: sort } }, { $skip: skip }, { $limit: limit });
    const countPipeline = [...($text ? [{ $match: { $text: $text } }] : []), ...sharedStages, { $count: "total" }];

    let result = await this.collection().aggregate(pipeline).toArray();
    let countResult = await this.collection().aggregate(countPipeline).toArray();
    let total_documents = countResult[0]?.total || 0;

    if (result.length === 0 && $text) {
      const regex = { $regex: $text.$search, $options: "i" };

      const regexMatch = {
        $match: {
          $or: [{ title: regex }, { description: regex }],
          ..._query,
        },
      };

      const fallbackPipeline = [regexMatch, ...sharedStages.slice(1), { $sort: { _id: sort } }, { $skip: skip }, { $limit: limit }];
      const fallbackCountPipeline = [regexMatch, ...sharedStages.slice(1), { $count: "total" }];

      result = await this.collection().aggregate(fallbackPipeline).toArray();
      countResult = await this.collection().aggregate(fallbackCountPipeline).toArray();
      total_documents = countResult[0]?.total || 0;
    }

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
