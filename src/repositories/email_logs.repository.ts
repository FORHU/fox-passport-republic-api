import { TEmailLogs } from "../models/email_logs.model";
import { getDB } from "../utils/mongo";

export default class EmailLogsRepo {
  static collection() {
    return getDB().collection("email-logs");
  }

  static async createEmailLog(data: TEmailLogs) {
    const result = await this.collection().insertOne(data);
    return result;
  }

  static async getEmailLogs(query: any, skip: number, limit: number) {
    const result = await this.collection().find(query).skip(skip).limit(limit).toArray();
    return result;
  }

  static async getOneEmailLog(query: any) {
    const result = await this.collection().findOne(query);
    return result;
  }
}
