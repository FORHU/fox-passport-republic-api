import { Prisma } from "@prisma/client";
import NotificationRepository from "./user-notification.repository";
import { CreateNotificationInput } from "./user-notification.types";
import { io } from "../../infrastructure/socket/socket.server";
import { emitToUser } from "../../infrastructure/socket/socket.utils";
import { SOCKET_EVENTS } from "../../infrastructure/socket/socket.constants";

export default class NotificationService {
  static async create(input: CreateNotificationInput) {
    const notification = await NotificationRepository.create({
      ...input,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
    });
    // Best-effort, like every invalidation in `invalidate.ts`. The row is
    // already written, and `RoleRequestSvc.review` awaits this with no
    // try/catch of its own, so a throw here would answer 500 to a decision that
    // has already committed - the applicant holds the role and the admin is
    // told it failed.
    try {
      emitToUser(io, input.userId, SOCKET_EVENTS.NEW_NOTIFICATION, {
        ...notification,
        metadata: notification.metadata as
          Record<string, unknown> | null | undefined,
      });
    } catch (e) {
      console.error("Failed to push notification over the socket:", e);
    }

    return notification;
  }

  static async getForUser(userId: string, limit?: number) {
    const [notifications, unreadCount] = await Promise.all([
      NotificationRepository.findByUserId(userId, limit),
      NotificationRepository.countUnread(userId),
    ]);
    return { notifications, unreadCount };
  }

  static async markAsRead(notificationId: string, userId: string) {
    return NotificationRepository.markAsRead(notificationId, userId);
  }

  static async markAllAsRead(userId: string) {
    return NotificationRepository.markAllAsRead(userId);
  }
}
