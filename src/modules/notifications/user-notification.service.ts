import { Prisma } from "@prisma/client";
import NotificationRepository from "./user-notification.repository";
import {
  CreateNotificationInput,
  NotificationDTO,
} from "./user-notification.types";
import {
  FeedTargetLookup,
  feedRefIds,
  resolveFeedTarget,
} from "./feed-notification-target";
import { io } from "../../infrastructure/socket/socket.server";
import { emitToUser } from "../../infrastructure/socket/socket.utils";
import { SOCKET_EVENTS } from "../../infrastructure/socket/socket.constants";

type NotificationRow = { type: string; metadata: Prisma.JsonValue | null };

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
        // Just written, so what it points at exists.
        target: resolveFeedTarget(notification.type, notification.metadata),
      });
    } catch (e) {
      console.error("Failed to push notification over the socket:", e);
    }

    return notification;
  }

  static async getForUser(userId: string, limit?: number) {
    const [rows, unreadCount] = await Promise.all([
      NotificationRepository.findByUserId(userId, limit),
      NotificationRepository.countUnread(userId),
    ]);
    const notifications = await NotificationService.withTargets(rows);
    return { notifications, unreadCount };
  }

  /**
   * Adds `target` to each notification, checking in one lookup whether the
   * posts and comments they point at still exist. Deleted content is reported
   * as `available: false`, never as an error.
   */
  static async withTargets<T extends NotificationRow>(
    rows: T[],
  ): Promise<(T & { target: NotificationDTO["target"] })[]> {
    const postIds = new Set<string>();
    const commentIds = new Set<string>();
    for (const row of rows) {
      const ids = feedRefIds(row.type, row.metadata);
      if (ids?.postId) postIds.add(ids.postId);
      if (ids?.commentId) commentIds.add(ids.commentId);
    }
    if (postIds.size === 0 && commentIds.size === 0) {
      return rows.map((row) => ({ ...row, target: null }));
    }

    const found = await NotificationRepository.findFeedTargets(
      [...postIds],
      [...commentIds],
    );
    const comments: FeedTargetLookup["comments"] = new Map(
      found.comments.map((c) => [
        c.id,
        { postId: c.postId, parentId: c.parentId },
      ]),
    );
    // A comment-like row from before `postId` was stored learns its post from
    // the comment, so that post's existence has to be known too.
    const lookup: FeedTargetLookup = {
      postIds: new Set(found.posts.map((p) => p.id)),
      comments,
    };
    const missingPosts = [...comments.values()]
      .map((c) => c.postId)
      .filter((id) => !postIds.has(id));
    if (missingPosts.length > 0) {
      const extra = await NotificationRepository.findFeedTargets(
        [...new Set(missingPosts)],
        [],
      );
      for (const p of extra.posts) lookup.postIds.add(p.id);
    }

    return rows.map((row) => ({
      ...row,
      target: resolveFeedTarget(row.type, row.metadata, lookup),
    }));
  }

  static async markAsRead(notificationId: string, userId: string) {
    return NotificationRepository.markAsRead(notificationId, userId);
  }

  static async markAllAsRead(userId: string) {
    return NotificationRepository.markAllAsRead(userId);
  }
}
