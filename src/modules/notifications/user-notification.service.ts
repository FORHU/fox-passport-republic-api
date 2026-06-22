import NotificationRepository from "./user-notification.repository";
import { CreateNotificationInput } from "./user-notification.types";
import { io } from "../../infrastructure/socket/socket.server";
import { emitToUser } from "../../infrastructure/socket/socket.utils";

export default class NotificationService {
  static async create(input: CreateNotificationInput) {
    const notification = await NotificationRepository.create({
  ...input,
    metadata: (input.metadata ?? undefined) as any,
});
    emitToUser(io, input.userId, "new_notification", {
      ...notification,
      metadata: notification.metadata as Record<string, unknown> | null | undefined,
    });

    return notification;
  }

  static async getForUser(userId: string) {
    return NotificationRepository.findByUserId(userId);
  }

  static async markAsRead(notificationId: string) {
    return NotificationRepository.markAsRead(notificationId);
  }

  static async markAllAsRead(userId: string) {
    return NotificationRepository.markAllAsRead(userId);
  }
}