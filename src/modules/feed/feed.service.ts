import {
  PostType,
  FeedTab,
  UserPath,
  PostVisibility,
  ReactionType,
} from "@prisma/client";
import FeedRepo, { QueryFeedOptions } from "./feed.repository";
import PassportSvc, { XP_REWARDS } from "../passport/passport.service";
import NotificationService from "../notifications/user-notification.service";
import { prisma } from "../../utils/prisma";
import { AuthenticatedUser } from "../../types/auth";

export interface MediaTagInput {
  mediaUrl: string;
  userId: string;
  x: number;
  y: number;
}

export interface CreatePostInput {
  type: PostType;
  content: string;
  mediaUrls?: string[];
  visibility?: PostVisibility;
  venueId?: string;
  assetId?: string;
  serviceId?: string;
  eventId?: string;
  reviewId?: string;
  stampId?: string;
  mediaTags?: MediaTagInput[];
}

// Matches @handle tokens in post/comment text — letters, digits, underscore,
// same character set usernames are created with elsewhere in the app.
const MENTION_PATTERN = /@([a-zA-Z0-9_]{2,32})/g;

async function notifyMentions(
  content: string,
  actorId: string,
  metadata: Record<string, unknown>,
) {
  const handles = [...content.matchAll(MENTION_PATTERN)].map((m) => m[1]);
  if (handles.length === 0) return;

  const uniqueHandles = [...new Set(handles.map((h) => h.toLowerCase()))];
  const mentioned = await prisma.user.findMany({
    where: {
      username: { in: uniqueHandles, mode: "insensitive" },
      id: { not: actorId },
    },
    select: { id: true },
  });

  await Promise.all(
    mentioned.map((u) =>
      NotificationService.create({
        userId: u.id,
        type: "feed:mention",
        title: "You were mentioned in the Republic",
        message: "Someone mentioned you in a post.",
        metadata,
      }).catch((err) =>
        console.warn(
          "[FeedService] Best-effort mention notification failed:",
          err,
        ),
      ),
    ),
  );
}

// Every tagged mediaUrl must belong to the post's own media, and every
// tagged userId must be a real user — checked up front so a bad tag never
// gets written and the post create doesn't partially succeed.
async function validateMediaTags(
  mediaTags: MediaTagInput[],
  postMediaUrls: string[],
) {
  for (const tag of mediaTags) {
    if (!postMediaUrls.includes(tag.mediaUrl)) {
      throw new Error(
        `Media tag references a mediaUrl that isn't part of this post: ${tag.mediaUrl}`,
      );
    }
  }

  const userIds = [...new Set(mediaTags.map((t) => t.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  if (users.length !== userIds.length) {
    throw new Error("One or more tagged users could not be found");
  }
}

async function notifyMediaTags(
  mediaTags: { userId: string }[],
  actorId: string,
  postId: string,
) {
  const uniqueUserIds = [...new Set(mediaTags.map((t) => t.userId))].filter(
    (id) => id !== actorId,
  );
  if (uniqueUserIds.length === 0) return;

  await Promise.all(
    uniqueUserIds.map((userId) =>
      NotificationService.create({
        userId,
        type: "feed:media_tag",
        title: "You were tagged in a photo",
        message: "Someone tagged you in a photo on the Republic feed.",
        metadata: { postId },
      }).catch((err) =>
        console.warn(
          "[FeedService] Best-effort media tag notification failed:",
          err,
        ),
      ),
    ),
  );
}

export default class FeedService {
  static async getFeed(options: QueryFeedOptions) {
    return FeedRepo.findPosts(options);
  }

  static async getPostById(id: string, viewerId?: string) {
    const post = await FeedRepo.findPostById(id, viewerId);
    if (!post) {
      throw new Error("Post not found");
    }
    return post;
  }

  static async createPost(user: AuthenticatedUser, input: CreatePostInput) {
    const {
      type,
      content,
      mediaUrls = [],
      visibility,
      venueId,
      assetId,
      serviceId,
      eventId,
      reviewId,
      stampId,
      mediaTags,
    } = input;

    if (mediaTags && mediaTags.length > 0) {
      await validateMediaTags(mediaTags, mediaUrls);
    }

    let tab: FeedTab = FeedTab.community;

    // 1. Role-based authorization & entity verification per post type
    switch (type) {
      case PostType.citizen_experience: {
        tab = FeedTab.community;
        if (stampId) {
          const stamp = await prisma.passportStamp.findUnique({
            where: { id: stampId },
            include: { passport: true },
          });
          if (!stamp || stamp.passport.userId !== user.userId) {
            throw new Error("Stamp not found or does not belong to you");
          }
        }
        break;
      }

      case PostType.review_share: {
        tab = FeedTab.community;
        if (!reviewId) {
          throw new Error("reviewId is required for review_share");
        }
        const review = await prisma.review.findUnique({
          where: { id: reviewId },
          include: { booking: true },
        });
        if (!review || review.userId !== user.userId) {
          throw new Error("Review not found or does not belong to you");
        }
        if (review.booking && review.booking.status === "cancelled") {
          throw new Error("Cannot share reviews from cancelled bookings");
        }
        break;
      }

      case PostType.venue_spotlight: {
        tab = FeedTab.marketplace;
        if (!venueId) {
          throw new Error("venueId is required for venue_spotlight");
        }
        const isAuthorized =
          user.systemRole === "admin" ||
          user.systemRole === "admin_secretary" ||
          user.roleType.includes("venueFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new Error("Unauthorized: Venue Foxer or Partner role required");
        }
        const venue = await prisma.venue.findUnique({
          where: { id: venueId },
        });
        if (!venue) {
          throw new Error("Venue not found");
        }
        if (venue.mayorId !== user.userId && user.systemRole !== "admin") {
          throw new Error("You can only spotlight venues you own");
        }
        break;
      }

      case PostType.gear_offering: {
        tab = FeedTab.marketplace;
        if (!assetId) {
          throw new Error("assetId is required for gear_offering");
        }
        const isAuthorized =
          user.systemRole === "admin" ||
          user.systemRole === "admin_secretary" ||
          user.roleType.includes("gearFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new Error("Unauthorized: Equipment Foxer or Partner role required");
        }
        const asset = await prisma.asset.findUnique({
          where: { id: assetId },
        });
        if (!asset) {
          throw new Error("Asset/Gear not found");
        }
        if (asset.ownerId !== user.userId && user.systemRole !== "admin") {
          throw new Error("You can only spotlight gear you own");
        }
        break;
      }

      case PostType.service_offering: {
        tab = FeedTab.marketplace;
        if (!serviceId) {
          throw new Error("serviceId is required for service_offering");
        }
        const isAuthorized =
          user.systemRole === "admin" ||
          user.systemRole === "admin_secretary" ||
          user.roleType.includes("serviceFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new Error(
            "Unauthorized: Talent Foxer or Partner role required",
          );
        }
        const service = await prisma.service.findUnique({
          where: { id: serviceId },
        });
        if (!service) {
          throw new Error("Service not found");
        }
        if (service.ownerId !== user.userId && user.systemRole !== "admin") {
          throw new Error("You can only spotlight services you own");
        }
        break;
      }

      case PostType.event_announcement: {
        tab = FeedTab.marketplace;
        if (!eventId) {
          throw new Error("eventId is required for event_announcement");
        }
        const isAuthorized =
          user.systemRole === "admin" ||
          user.systemRole === "admin_secretary" ||
          user.roleType.includes("eventFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new Error("Unauthorized: Event Foxer or Partner role required");
        }
        const event = await prisma.event.findUnique({
          where: { id: eventId },
        });
        if (!event) {
          throw new Error("Event not found");
        }
        if (event.organizerId !== user.userId && user.systemRole !== "admin") {
          throw new Error("You can only announce events you host");
        }
        break;
      }

      case PostType.partner_announcement: {
        tab = FeedTab.partners;
        const isPartner =
          user.systemRole === "admin" || user.roleType.includes("investor");
        if (!isPartner) {
          throw new Error("Unauthorized: Partner Foxer role required");
        }
        break;
      }

      default:
        throw new Error(`Unsupported post type: ${type}`);
    }

    // 2. Create the post in DB
    const post = await FeedRepo.createPost({
      authorId: user.userId,
      type,
      tab,
      content,
      mediaUrls,
      visibility,
      venueId,
      assetId,
      serviceId,
      eventId,
      reviewId,
      stampId,
      mediaTags,
    });

    notifyMentions(content, user.userId, { postId: post.id }).catch(() => {});
    if (mediaTags && mediaTags.length > 0) {
      notifyMediaTags(mediaTags, user.userId, post.id).catch(() => {});
    }

    // 3. Award XP via PassportSvc (with daily anti-spam cap)
    try {
      const postsCountToday = await FeedRepo.countUserPostsToday(user.userId);
      if (postsCountToday <= 1) {
        if (type === PostType.citizen_experience) {
          await PassportSvc.awardXP(
            user.userId,
            UserPath.user,
            XP_REWARDS.createCommunityPost,
          );
        } else if (type === PostType.review_share) {
          await PassportSvc.awardXP(
            user.userId,
            UserPath.user,
            XP_REWARDS.shareReviewPost,
          );
        } else if (type === PostType.venue_spotlight) {
          await PassportSvc.awardXP(user.userId, UserPath.venueFoxer, 25);
        } else if (type === PostType.gear_offering) {
          await PassportSvc.awardXP(user.userId, UserPath.gearFoxer, 25);
        } else if (type === PostType.service_offering) {
          await PassportSvc.awardXP(user.userId, UserPath.serviceFoxer, 25);
        } else if (type === PostType.event_announcement) {
          await PassportSvc.awardXP(user.userId, UserPath.eventFoxer, 25);
        } else if (type === PostType.partner_announcement) {
          await PassportSvc.awardXP(user.userId, UserPath.investor, 25);
        }
      }
    } catch (xpError) {
      console.warn("[FeedService] Best-effort XP award failed:", xpError);
    }

    // 4. Milestone badge: active community posting
    try {
      const totalPosts = await FeedRepo.countUserPosts(user.userId);
      if (totalPosts >= 5) {
        await PassportSvc.awardBadgeByName(user.userId, "Republic Voice");
      }
    } catch (badgeError) {
      console.warn("[FeedService] Badge award failed:", badgeError);
    }

    return post;
  }

  static async deletePost(postId: string, user: AuthenticatedUser) {
    const post = await FeedRepo.findPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    const canDelete =
      post.authorId === user.userId ||
      user.systemRole === "admin" ||
      user.systemRole === "admin_secretary";

    if (!canDelete) {
      throw new Error("Unauthorized to delete this post");
    }

    return FeedRepo.deletePost(postId);
  }

  static async editPost(
    postId: string,
    user: AuthenticatedUser,
    input: {
      content?: string;
      mediaUrls?: string[];
      visibility?: PostVisibility;
    },
  ) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.authorId !== user.userId) {
      throw new Error("Unauthorized to edit this post");
    }
    if (input.content !== undefined && input.content.trim().length === 0) {
      throw new Error("Post content cannot be empty");
    }
    return FeedRepo.updatePost(postId, {
      ...(input.content !== undefined ? { content: input.content.trim() } : {}),
      ...(input.mediaUrls !== undefined ? { mediaUrls: input.mediaUrls } : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
    });
  }

  // A repost is its own Post row pointing at the original via
  // originalPostId — the reposter's caption is optional (Facebook allows an
  // empty-caption share).
  static async repost(
    postId: string,
    user: AuthenticatedUser,
    caption: string,
  ) {
    const original = await FeedRepo.findPostById(postId, user.userId);
    if (!original) {
      throw new Error("Post not found");
    }
    if (original.originalPostId) {
      throw new Error("Cannot repost a repost — share the original instead");
    }

    const post = await FeedRepo.createPost({
      authorId: user.userId,
      type: original.type,
      tab: original.tab,
      content: caption.trim(),
      visibility: PostVisibility.public,
      originalPostId: postId,
    });

    await FeedRepo.incrementShares(postId);

    if (original.authorId !== user.userId) {
      NotificationService.create({
        userId: original.authorId,
        type: "feed:repost",
        title: "Your post was reposted",
        message: `${user.email} reposted your post.`,
        metadata: { postId, repostId: post.id, reposterId: user.userId },
      }).catch(() => {});
    }

    return post;
  }

  static async trackShare(postId: string) {
    const post = await FeedRepo.findPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }
    await FeedRepo.incrementShares(postId);
    return { success: true };
  }

  static async setReaction(
    postId: string,
    user: AuthenticatedUser,
    type: ReactionType | null,
  ) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw new Error("Post not found");
    }

    const result = await FeedRepo.setReaction(postId, user.userId, type);

    if (type && !post.isLikedByMe && post.authorId !== user.userId) {
      NotificationService.create({
        userId: post.authorId,
        type: "feed:like",
        title: "New Reaction on your Republic Post",
        message: `${user.email} reacted to your post.`,
        metadata: { postId, reactorId: user.userId, reaction: type },
      }).catch((err) =>
        console.warn(
          "[FeedService] Best-effort reaction notification failed:",
          err,
        ),
      );
    }

    return result;
  }

  static async getReactionBreakdown(postId: string) {
    return FeedRepo.getReactionBreakdown(postId);
  }

  static async toggleSave(postId: string, user: AuthenticatedUser) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw new Error("Post not found");
    }
    return FeedRepo.toggleSave(postId, user.userId);
  }

  static async getSavedPosts(
    user: AuthenticatedUser,
    limit?: number,
    cursor?: string,
  ) {
    return FeedRepo.findSavedPosts(user.userId, limit, cursor);
  }

  static async hidePost(postId: string, user: AuthenticatedUser) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw new Error("Post not found");
    }
    return FeedRepo.hidePost(postId, user.userId);
  }

  static async searchMentionCandidates(query: string) {
    if (!query || query.trim().length === 0) return [];
    return FeedRepo.searchMentionCandidates(query.trim());
  }

  static async getComments(
    postId: string,
    limit?: number,
    cursor?: string,
    viewerId?: string,
  ) {
    const post = await FeedRepo.findPostById(postId, viewerId);
    if (!post) {
      throw new Error("Post not found");
    }
    return FeedRepo.findComments(postId, limit, cursor, viewerId);
  }

  static async addComment(
    postId: string,
    user: AuthenticatedUser,
    content: string,
    parentId?: string,
  ) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw new Error("Post not found");
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error("Comment cannot be empty");
    }

    if (parentId) {
      const parent = await FeedRepo.findCommentById(parentId);
      if (!parent || parent.postId !== postId) {
        throw new Error("Parent comment not found");
      }
      if (parent.parentId) {
        throw new Error("Cannot reply to a reply");
      }
    }

    const comment = await FeedRepo.createComment(
      postId,
      user.userId,
      trimmed,
      parentId,
    );

    notifyMentions(trimmed, user.userId, {
      postId,
      commentId: comment.id,
    }).catch(() => {});

    // Notify post author if not self
    if (post.authorId !== user.userId) {
      NotificationService.create({
        userId: post.authorId,
        type: "feed:comment",
        title: "New Comment on your Republic Post",
        message: `Someone commented on your post: "${trimmed.slice(0, 60)}${trimmed.length > 60 ? "..." : ""}"`,
        metadata: {
          postId,
          commentId: comment.id,
          authorId: user.userId,
        },
      }).catch((err) =>
        console.warn(
          "[FeedService] Best-effort comment notification failed:",
          err,
        ),
      );
    }

    return comment;
  }

  static async deleteComment(commentId: string, user: AuthenticatedUser) {
    const comment = await FeedRepo.findCommentById(commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    const post = await FeedRepo.findPostById(comment.postId);

    const canDelete =
      comment.authorId === user.userId ||
      (post && post.authorId === user.userId) ||
      user.systemRole === "admin" ||
      user.systemRole === "admin_secretary";

    if (!canDelete) {
      throw new Error("Unauthorized to delete this comment");
    }

    return FeedRepo.deleteComment(commentId);
  }

  static async toggleCommentLike(commentId: string, user: AuthenticatedUser) {
    const comment = await FeedRepo.findCommentById(commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    const result = await FeedRepo.toggleCommentLike(commentId, user.userId);

    if (result.liked && comment.authorId !== user.userId) {
      NotificationService.create({
        userId: comment.authorId,
        type: "feed:comment_like",
        title: "New Like on your Comment",
        message: `${user.email} liked your comment.`,
        metadata: { commentId, likerId: user.userId },
      }).catch(() => {});
    }

    return result;
  }

  static async addMediaTag(
    postId: string,
    user: AuthenticatedUser,
    input: MediaTagInput,
  ) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.authorId !== user.userId) {
      throw new Error("Unauthorized: only the post author can tag people");
    }

    await validateMediaTags([input], post.mediaUrls);

    const tag = await FeedRepo.createMediaTag(postId, input);

    if (input.userId !== user.userId) {
      NotificationService.create({
        userId: input.userId,
        type: "feed:media_tag",
        title: "You were tagged in a photo",
        message: `${user.email} tagged you in a photo on the Republic feed.`,
        metadata: { postId, tagId: tag.id, taggerId: user.userId },
      }).catch((err) =>
        console.warn(
          "[FeedService] Best-effort media tag notification failed:",
          err,
        ),
      );
    }

    return tag;
  }

  static async deleteMediaTag(
    postId: string,
    tagId: string,
    user: AuthenticatedUser,
  ) {
    const tag = await FeedRepo.findMediaTagById(tagId);
    if (!tag || tag.postId !== postId) {
      throw new Error("Media tag not found");
    }

    const post = await FeedRepo.findPostById(postId);
    const canDelete =
      tag.userId === user.userId ||
      (post && post.authorId === user.userId) ||
      user.systemRole === "admin" ||
      user.systemRole === "admin_secretary";

    if (!canDelete) {
      throw new Error("Unauthorized to remove this tag");
    }

    await FeedRepo.deleteMediaTag(tagId);
    return { success: true };
  }
}
