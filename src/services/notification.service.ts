import { ObjectId } from "mongodb";
import { TNotifications } from "../models/notification.model";
import NotificationRepo from "../repositories/notification.repository";

export default class NotificationSvc {
  static async createNotification(data: TNotifications) {
    const result = await NotificationRepo.createNotification(data);
    return result;
  }

  static async getUnreadNotificationsCount(query: any) {
    const result = await NotificationRepo.getUnreadNotificationsCount(query);
    return result;
  }

  static async getOneNotification(query: any) {
    const result = await NotificationRepo.getOneNotification(query);
    return result;
  }

  static async updateNotification(query: any, data: any) {
    const result = await NotificationRepo.updateNotification(query, data);
    return result;
  }
}
