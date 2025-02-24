import { TEmailLogs } from "../../models/email_logs.model";
import { getDB } from "../../utils/mongo";

export default class EmailLogsRepo {
  static collection() {
    return getDB().collection("email-logs");
  }

  static async getOneEmailLog(query: any) {
    const result = await this.collection().findOne(query);
    return result;
  }
}
