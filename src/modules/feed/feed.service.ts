import { AppError, notFound } from "../../utils/errors";
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
import { can } from "../../types/permissions";

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
  pollOptions?: string[];
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
      throw new AppError(
        `Media tag references a mediaUrl that isn't part of this post: ${tag.mediaUrl}`,
        400,
      );
    }
  }

  const userIds = [...new Set(mediaTags.map((t) => t.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  if (users.length !== userIds.length) {
    throw new AppError("One or more tagged users could not be found", 400);
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
      throw notFound("Post");
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
      pollOptions,
    } = input;

    if (!content.trim() && mediaUrls.length === 0) {
      throw new AppError("Post must include text or media", 400);
    }

    if (mediaTags && mediaTags.length > 0) {
      await validateMediaTags(mediaTags, mediaUrls);
    }

    let tab: FeedTab = FeedTab.community;
    let trimmedPollOptions: string[] = [];

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
            throw new AppError(
              "Stamp not found or does not belong to you",
              403,
            );
          }
        }
        break;
      }

      case PostType.review_share: {
        tab = FeedTab.community;
        if (!reviewId) {
          throw new AppError("reviewId is required for review_share", 400);
        }
        const review = await prisma.review.findUnique({
          where: { id: reviewId },
          include: { booking: true },
        });
        if (!review || review.userId !== user.userId) {
          throw new AppError("Review not found or does not belong to you", 403);
        }
        if (review.booking && review.booking.status === "cancelled") {
          throw new AppError(
            "Cannot share reviews from cancelled bookings",
            400,
          );
        }
        break;
      }

      case PostType.venue_spotlight: {
        tab = FeedTab.marketplace;
        if (!venueId) {
          throw new AppError("venueId is required for venue_spotlight", 400);
        }
        const isAuthorized =
          can(user, "feed:post-for-anyone") ||
          user.roleType.includes("venueFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new AppError(
            "Unauthorized: Venue Foxer or Partner role required",
            403,
          );
        }
        const venue = await prisma.venue.findUnique({
          where: { id: venueId },
        });
        if (!venue) {
          throw notFound("Venue");
        }
        if (
          venue.mayorId !== user.userId &&
          !can(user, "feed:post-for-anyone")
        ) {
          throw new AppError("You can only spotlight venues you own", 400);
        }
        break;
      }

      case PostType.gear_offering: {
        tab = FeedTab.marketplace;
        if (!assetId) {
          throw new AppError("assetId is required for gear_offering", 400);
        }
        const isAuthorized =
          can(user, "feed:post-for-anyone") ||
          user.roleType.includes("gearFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new AppError(
            "Unauthorized: Equipment Foxer or Partner role required",
            403,
          );
        }
        const asset = await prisma.asset.findUnique({
          where: { id: assetId },
        });
        if (!asset) {
          throw new AppError("Asset/Gear not found", 404);
        }
        if (
          asset.ownerId !== user.userId &&
          !can(user, "feed:post-for-anyone")
        ) {
          throw new AppError("You can only spotlight gear you own", 400);
        }
        break;
      }

      case PostType.service_offering: {
        tab = FeedTab.marketplace;
        if (!serviceId) {
          throw new AppError("serviceId is required for service_offering", 400);
        }
        const isAuthorized =
          can(user, "feed:post-for-anyone") ||
          user.roleType.includes("serviceFoxer") ||
          user.roleType.includes("performerFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new AppError(
            "Unauthorized: Talent Foxer, Performer Foxer, or Partner role required",
            403,
          );
        }
        const service = await prisma.service.findUnique({
          where: { id: serviceId },
        });
        if (!service) {
          throw notFound("Service");
        }
        if (
          service.ownerId !== user.userId &&
          !can(user, "feed:post-for-anyone")
        ) {
          throw new AppError("You can only spotlight services you own", 400);
        }
        break;
      }

      case PostType.event_announcement: {
        tab = FeedTab.marketplace;
        if (!eventId) {
          throw new AppError("eventId is required for event_announcement", 400);
        }
        const isAuthorized =
          can(user, "feed:post-for-anyone") ||
          user.roleType.includes("eventFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new AppError(
            "Unauthorized: Event Foxer or Partner role required",
            403,
          );
        }
        const event = await prisma.event.findUnique({
          where: { id: eventId },
        });
        if (!event) {
          throw notFound("Event");
        }
        if (
          event.organizerId !== user.userId &&
          !can(user, "feed:post-for-anyone")
        ) {
          throw new AppError("You can only announce events you host", 400);
        }
        break;
      }

      case PostType.partner_announcement: {
        tab = FeedTab.partners;
        const isPartner =
          can(user, "feed:post-for-anyone") ||
          user.roleType.includes("investor");
        if (!isPartner) {
          throw new AppError("Unauthorized: Partner Foxer role required", 403);
        }
        break;
      }

      case PostType.poll: {
        tab = FeedTab.community;
        const trimmedOptions = (pollOptions ?? [])
          .map((o) => o.trim())
          .filter((o) => o.length > 0);
        if (trimmedOptions.length < 2) {
          throw new AppError("A poll needs at least 2 options", 400);
        }
        if (trimmedOptions.length > 10) {
          throw new AppError("A poll can have at most 10 options", 400);
        }
        if (
          new Set(trimmedOptions.map((o) => o.toLowerCase())).size !==
          trimmedOptions.length
        ) {
          throw new AppError("Poll options must be unique", 400);
        }
        trimmedPollOptions = trimmedOptions;
        break;
      }

      default:
        throw new AppError(`Unsupported post type: ${type}`, 400);
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
      pollOptions: trimmedPollOptions,
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
          // Poster already passed the case-block ownership check above, so
          // their own roleType (not the listing's category) is enough to
          // resolve which path earns the XP.
          await PassportSvc.awardXP(
            user.userId,
            user.roleType.includes("performerFoxer")
              ? UserPath.performerFoxer
              : UserPath.serviceFoxer,
            25,
          );
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

  static async voteOnPoll(
    postId: string,
    optionId: string,
    user: AuthenticatedUser,
  ) {
    const post = await FeedRepo.findPostById(postId, user.userId);
    if (!post) {
      throw notFound("Post");
    }
    if (post.type !== PostType.poll || !post.poll) {
      throw new AppError("This post is not a poll", 400);
    }

    const option = await FeedRepo.findPollOption(optionId);
    if (!option || option.pollId !== post.poll.id) {
      throw notFound("Poll option");
    }

    return FeedRepo.voteOnPoll(post.poll.id, optionId, user.userId);
  }

  static async deletePost(postId: string, user: AuthenticatedUser) {
    const post = await FeedRepo.findPostById(postId);
    if (!post) {
      throw notFound("Post");
    }

    const canDelete =
      post.authorId === user.userId || can(user, "content:moderate");

    if (!canDelete) {
      throw new AppError("Unauthorized to delete this post", 403);
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
      throw notFound("Post");
    }
    if (post.authorId !== user.userId) {
      throw new AppError("Unauthorized to edit this post", 403);
    }
    if (input.content !== undefined && input.content.trim().length === 0) {
      throw new AppError("Post content cannot be empty", 400);
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
      throw notFound("Post");
    }
    if (original.originalPostId) {
      throw new AppError(
        "Cannot repost a repost — share the original instead",
        400,
      );
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
      throw notFound("Post");
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
      throw notFound("Post");
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
      throw notFound("Post");
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
      throw notFound("Post");
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
      throw notFound("Post");
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
      throw notFound("Post");
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new AppError("Comment cannot be empty", 400);
    }

    if (parentId) {
      const parent = await FeedRepo.findCommentById(parentId);
      if (!parent || parent.postId !== postId) {
        throw notFound("Parent comment");
      }
      if (parent.parentId) {
        throw new AppError("Cannot reply to a reply", 400);
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

  static async editComment(
    commentId: string,
    user: AuthenticatedUser,
    content: string,
  ) {
    const comment = await FeedRepo.findCommentById(commentId);
    if (!comment) {
      throw notFound("Comment");
    }
    if (comment.authorId !== user.userId) {
      throw new AppError("Unauthorized to edit this comment", 403);
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new AppError("Comment cannot be empty", 400);
    }

    return FeedRepo.updateComment(commentId, trimmed);
  }

  static async deleteComment(commentId: string, user: AuthenticatedUser) {
    const comment = await FeedRepo.findCommentById(commentId);
    if (!comment) {
      throw notFound("Comment");
    }

    const post = await FeedRepo.findPostById(comment.postId);

    const canDelete =
      comment.authorId === user.userId ||
      (post && post.authorId === user.userId) ||
      can(user, "content:moderate");

    if (!canDelete) {
      throw new AppError("Unauthorized to delete this comment", 403);
    }

    return FeedRepo.deleteComment(commentId);
  }

  static async toggleCommentLike(commentId: string, user: AuthenticatedUser) {
    const comment = await FeedRepo.findCommentById(commentId);
    if (!comment) {
      throw notFound("Comment");
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
      throw notFound("Post");
    }
    if (post.authorId !== user.userId) {
      throw new AppError(
        "Unauthorized: only the post author can tag people",
        403,
      );
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
      throw notFound("Media tag");
    }

    const post = await FeedRepo.findPostById(postId);
    const canDelete =
      tag.userId === user.userId ||
      (post && post.authorId === user.userId) ||
      can(user, "content:moderate");

    if (!canDelete) {
      throw new AppError("Unauthorized to remove this tag", 403);
    }

    await FeedRepo.deleteMediaTag(tagId);
    return { success: true };
  }
}
