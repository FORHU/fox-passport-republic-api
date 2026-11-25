import prisma from "../../../prisma/client";
import type { Prisma } from "@prisma/client";

export default class NotificationRepository {
  static async create(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata,
      },
    });
  }

  static async findByUserId(userId: string, limit?: number) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      ...(typeof limit === "number" ? { take: limit } : {}),
    });
  }

  /**
   * Which of these Republic posts and comments still exist (both are
   * hard-deleted), with each comment's post and parent. Two primary-key
   * lookups for a whole page of notifications.
   */
  static async findFeedTargets(postIds: string[], commentIds: string[]) {
    const [posts, comments] = await Promise.all([
      postIds.length
        ? prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true },
          })
        : [],
      commentIds.length
        ? prisma.postComment.findMany({
            where: { id: { in: commentIds } },
            select: { id: true, postId: true, parentId: true },
          })
        : [],
    ]);
    return { posts, comments };
  }

  static async countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  static async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.update({
      where: { id: notificationId, userId: userId },
      data: { isRead: true },
    });
  }

  static async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
