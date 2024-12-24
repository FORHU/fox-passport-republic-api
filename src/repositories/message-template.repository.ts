import { ObjectId } from "mongodb";

import { MMessageTemplate, TMessageTemplate } from "../models/message-template.model";
import { getDB } from "../utils/mongo";

export default class MessageTemplateRepo {
  static collection() {
    return getDB().collection("message-templates");
  }

  static async createMessageTemplate(data: TMessageTemplate) {
    return this.collection().insertOne(new MMessageTemplate(data));
  }

  static async getMessageTemplate(query: any) {
    return this.collection()
      .aggregate([
        { $match: query },
        {
          $lookup: {
            from: "files",
            localField: "attachments",
            foreignField: "_id",
            as: "attachments",
          },
        },
      ])
      .toArray();
  }

  static async updateMessageTemplate(message_template_id: ObjectId, data: any) {
    return this.collection().updateOne({ _id: message_template_id }, { $set: data });
  }
}
