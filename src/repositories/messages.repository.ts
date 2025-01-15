import { MMessage, TMessage } from "../models/message.model";
import { getDB } from "../utils/mongo";

export default class InboxRepo {
  static collection() {
    return getDB().collection("messages");
  }

  static async createMessage(data: TMessage) {
    return this.collection().insertOne(new MMessage(data));
  }

  static async getMessages(query: any, skip: number, limit: number) {
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $unwind: "$sender",
      },
      {
        $lookup: {
          from: "files",
          localField: "attachments",
          foreignField: "_id",
          as: "attachments",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "sender.profile_picture",
          foreignField: "_id",
          as: "profile_picture",
        },
      },
      {
        $match: query,
      },
      {
        $project: {
          _id: 1,
          inbox: 1,
          room_id: 1,
          sender: {
            _id: "$sender._id",
            first_name: "$sender.first_name",
            last_name: "$sender.last_name",
            profile_picture: { $arrayElemAt: ["$profile_picture.path", 0] },
          },
          content: 1,
          generated_content: 1,
          key: 1,
          attachments: 1,
          admin_generated: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1,
          deletedBy: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static countMessages(query: any) {
    return this.collection().countDocuments(query);
  }

  static async bulkCreateMessage(data: TMessage[]) {
    return this.collection().insertMany(data);
  }
}
