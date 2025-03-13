import { TNotications, MNotications } from "../models/notification.model";
import { getDB } from "../utils/mongo";

export default class NotificationRepo {
  static collection() {
    return getDB().collection("notifications");
  }

  static async createNotification(data: TNotications) {
    try {
      const notifInstance = new MNotications(data);
      await this.collection().insertOne(notifInstance);
      return notifInstance;
    } catch (error) {
      throw error;
    }
  }
}
