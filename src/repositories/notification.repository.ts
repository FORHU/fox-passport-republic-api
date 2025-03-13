import { TNotifications, MNotifications } from "../models/notification.model";
import { getDB } from "../utils/mongo";

export default class NotificationRepo {
  static collection() {
    return getDB().collection("notifications");
  }

  static async createNotification(data: TNotifications) {
    try {
      const notifInstance = new MNotifications(data);
      await this.collection().insertOne(notifInstance);
      return notifInstance;
    } catch (error) {
      throw error;
    }
  }

  static async getOneNotification(query: TNotifications) {
    try {
      const result = await this.collection().findOne(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getUnreadNotificationsCountEnquiries(query: any) {
    try {
      const count = await this.collection().countDocuments(query);
      return count;
    } catch (error) {
      throw error;
    }
  }

  static async updateNotification(query: any, data: any) {
    try {
      const result = await this.collection().updateMany(query, { $set: data });
      return result;
    } catch (error) {
      throw error;
    }
  }
}
