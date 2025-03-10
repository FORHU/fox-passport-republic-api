import { TNotications } from "../models/notification.model";
import NotificationRepo from "../repositories/notification.repository";

export default class NotificationSvc {
  static async createNotification(data: TNotications) {
    const result = await NotificationRepo.createNotification(data);
    return result;
  }
}
