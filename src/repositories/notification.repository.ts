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

  static async getUnreadNotificationsCount(query: any) {
    try {
      const result = await this.collection()
        .aggregate([
          { $match: query },
          {
            $facet: {
              totalUnreadCount: [{ $count: "count" }],
              unreadCountsByType: [
                {
                  $group: {
                    _id: "$type",
                    count: { $sum: 1 },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    type: "$_id",
                    count: 1,
                  },
                },
              ],
            },
          },
        ])
        .toArray();

      const data = result[0] || {};
      const totalUnreadCount = data.totalUnreadCount[0]?.count || 0;
      const unreadCountsByType = data.unreadCountsByType || [];

      return {
        totalUnreadCount,
        unreadCountsByType,
      };
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
