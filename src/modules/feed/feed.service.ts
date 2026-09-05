import { PostType, FeedTab, UserPath } from "@prisma/client";
import FeedRepo, { QueryFeedOptions } from "./feed.repository";
import PassportSvc, { XP_REWARDS } from "../passport/passport.service";
import NotificationService from "../notifications/user-notification.service";
import { prisma } from "../../utils/prisma";
import { AuthenticatedUser } from "../../types/auth";

export interface CreatePostInput {
  type: PostType;
  content: string;
  mediaUrls?: string[];
  venueId?: string;
  assetId?: string;
  serviceId?: string;
  eventId?: string;
  reviewId?: string;
  stampId?: string;
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
      venueId,
      assetId,
      serviceId,
      eventId,
      reviewId,
      stampId,
    } = input;

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
          throw new Error("Unauthorized: Gear Foxer or Partner role required");
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
          throw new Error("Unauthorized: Service Foxer or Partner role required");
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
          user.systemRole === "admin" ||
          user.roleType.includes("investor");
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
      venueId,
      assetId,
      serviceId,
      eventId,
      reviewId,
      stampId,
    });

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

  static async toggleLike(postId: string, user: AuthenticatedUser) {
    const post = await FeedRepo.findPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    const result = await FeedRepo.toggleLike(postId, user.userId);

    // Send notification if newly liked and not by self
    if (result.liked && post.authorId !== user.userId) {
      NotificationService.create({
        userId: post.authorId,
        type: "feed:like",
        title: "New Like on your Republic Post",
        message: `${user.email} liked your post.`,
        metadata: {
          postId,
          likerId: user.userId,
        },
      }).catch((err) =>
        console.warn("[FeedService] Best-effort like notification failed:", err),
      );
    }

    return result;
  }

  static async getComments(postId: string, limit?: number, cursor?: string) {
    const post = await FeedRepo.findPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }
    return FeedRepo.findComments(postId, limit, cursor);
  }

  static async addComment(
    postId: string,
    user: AuthenticatedUser,
    content: string,
  ) {
    const post = await FeedRepo.findPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error("Comment cannot be empty");
    }

    const comment = await FeedRepo.createComment(postId, user.userId, trimmed);

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
}
