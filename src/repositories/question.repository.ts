import { ObjectId } from "mongodb";

import { TQuestions } from "../models/questions.model";
import { getDB } from "../utils/mongo";

export default class EnquiryRepo {
  static collection() {
    return getDB().collection("questions");
  }

  static createQuestions(data: TQuestions[]) {
    const bulkOperations = data.map((questionnaire) => {
      const filter = { _id: questionnaire._id };
      const update = { $set: questionnaire };
      return {
        updateOne: {
          filter,
          update,
          upsert: true,
        },
      };
    });

    return this.collection().bulkWrite(bulkOperations);
  }

  static getQuestions(query: any, skip: number, limit: number) {
    return this.collection().find(query).skip(skip).limit(limit).toArray();
  }

  static countQuestions(query: any) {
    return this.collection().countDocuments(query);
  }

  static async deleteQuestions(ids: ObjectId[]) {
    const result = await this.collection().deleteMany({ _id: { $in: ids } });
    return result.deletedCount;
  }
}
