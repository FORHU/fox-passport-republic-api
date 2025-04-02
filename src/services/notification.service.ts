import { ObjectId } from "mongodb";
import { TNotifications } from "../models/notification.model";
import NotificationRepo from "../repositories/notification.repository";
import UserSvc from "./user.service";

export default class NotificationSvc {
  static async createNotification(data: TNotifications) {
    const result = await NotificationRepo.createNotification(data);
    return result;
  }

  static async getUnreadNotificationsCount(query: any) {
    return await NotificationRepo.getUnreadNotificationsCount(query);
  }

  static async getOneNotification(query: any) {
    const result = await NotificationRepo.getOneNotification(query);
    return result;
  }

  static async updateNotification(query: any, data: any) {
    const result = await NotificationRepo.updateNotification(query, data);
    return result;
  }

  static async deleteNotifications(query: any) {
    try {
      return await NotificationRepo.deleteNotifications(query);
    } catch (error) {
      throw error;
    }
  }

  static async getNotificationByRoomId(userId: string) {
    try {
      const user_id = new ObjectId(userId);
      const userData = await UserSvc.getUser({ _id: user_id });
      const query = {
        receiver: user_id,
        read: false,
      };

      const count = await this.getUnreadNotificationsCount(query);
      return {
        room_id: userData?.room_id,
        count,
      };
    } catch (err) {
      return err;
    }
  }
}
