import { AppError, notFound } from "../../utils/errors";
import {
  PostType,
  FeedTab,
  UserPath,
  PostVisibility,
  ReactionType,
} from "@prisma/client";
import FeedRepo, { FeedFilters, QueryFeedOptions } from "./feed.repository";
import {
  FRESH_POOL_SIZE,
  OLDER_POOL_SIZE,
  RESURFACE_RETENTION_DAYS,
  composeFeed,
  decodeForYouCursor,
  encodeForYouCursor,
  freshWeight,
  newSeed,
  olderWeight,
  pickFeatured,
  weightedOrder,
} from "../../utils/feed-ranking";
import PassportSvc from "../passport/passport.service";
import NotificationService from "../notifications/user-notification.service";
import { prisma } from "../../utils/prisma";
import { AuthenticatedUser } from "../../types/auth";
import { can } from "../../types/permissions";
import {
  announceNewPost,
  announcePostCommentsCount,
} from "../../infrastructure/socket/invalidate";

/**
 * - `foryou`: the ranked mix (app#308).
 * - `recent`: strictly newest first.
 * - `legacy`: newest first with pinned posts on top, for requests that send
 *   no mode (older mobile builds).
 */
export type FeedMode = "foryou" | "recent" | "legacy";

export interface GetFeedInput extends QueryFeedOptions {
  mode: FeedMode;
}

/** Tells open feeds a public post exists. Best-effort, like the comment count. */
function broadcastNewPost(post: { visibility: PostVisibility; tab: FeedTab }) {
  if (post.visibility === PostVisibility.public) announceNewPost(post.tab);
}

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

/** What a notification calls the person who acted; never their email. */
async function actorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true },
  });
  return u?.name?.trim() || u?.username || "Someone";
}

async function notifyMentions(
  content: string,
  actorId: string,
  metadata: Record<string, unknown>,
) {
  const handles = [...content.matchAll(MENTION_PATTERN)].map((m) => m[1]);
  if (handles.length === 0) return;

  const uniqueHandles = [...new Set(handles.map((h) => h.toLowerCase()))];
  const name = await actorName(actorId);
  const where = metadata.commentId ? "a comment" : "a post";
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
        message: `${name} mentioned you in ${where}.`,
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

/**
 * Tells every open feed the post's comment count, read back from the stored
 * counter so concurrent comments cannot leave a client on a stale number.
 * Public posts only: the event goes to every connected socket, so a
 * followers-only or only-me post's activity would reach people who cannot
 * see the post. Those posts' counts refresh on the commenter's own reload.
 * Best-effort: the comment is already saved.
 */
function broadcastCommentsCount(postId: string): void {
  FeedRepo.findCommentsCount(postId)
    .then((post) => {
      if (post?.visibility === PostVisibility.public) {
        announcePostCommentsCount(postId, post.commentsCount);
      }
    })
    .catch(() => {});
}

export default class FeedService {
  static async getFeed({ mode, ...options }: GetFeedInput) {
    if (mode === "foryou") return FeedService.getForYouFeed(options);
    return FeedRepo.findPosts({ ...options, pinnedFirst: mode === "legacy" });
  }

  /**
   * The For you feed (app#308). The first page draws a session (a random seed
   * and an anchor time); later pages carry it in the cursor, so every page
   * ranks the identical list and slices it at its offset. See
   * src/utils/feed-ranking.ts for the rules.
   */
  static async getForYouFeed(options: QueryFeedOptions) {
    const { limit = 20, cursor, viewerId } = options;

    let seed: string;
    let anchor: Date;
    let offset: number;
    if (cursor) {
      const decoded = decodeForYouCursor(cursor);
      if (!decoded) {
        throw new AppError(
          "This feed page has expired. Refresh to load the feed again.",
          400,
        );
      }
      ({ seed, anchor, offset } = decoded);
    } else {
      seed = newSeed();
      anchor = new Date();
      offset = 0;
    }

    const filters: FeedFilters = {
      tab: options.tab,
      type: options.type,
      authorId: options.authorId,
      search: options.search,
      viewerId,
    };
    const followingIds: Set<string> = viewerId
      ? await FeedRepo.getFollowingIds(viewerId)
      : new Set();

    const { fresh, older, pinned } = await FeedRepo.findRankingCandidates(
      filters,
      followingIds,
      anchor,
      FRESH_POOL_SIZE,
    );

    const featured = pickFeatured(pinned, seed);
    const notFeatured = (p: { id: string }) => p.id !== featured?.id;
    const hasAffinity = (authorId: string) =>
      authorId === viewerId || followingIds.has(authorId);

    const ranked = composeFeed({
      featured,
      fresh: weightedOrder(
        fresh.filter(notFeatured),
        (p) => freshWeight(p, anchor, hasAffinity(p.authorId)),
        seed,
        "fresh",
      ),
      older: weightedOrder(
        older.filter(notFeatured),
        (p) => olderWeight(p, p.lastShownAt, anchor),
        seed,
        "older",
      ).slice(0, OLDER_POOL_SIZE),
    });

    const page = ranked.slice(offset, offset + limit);
    const flags = new Map(page.map((e) => [e.post.id, e]));
    const posts = await FeedRepo.findPostsByIds(
      page.map((e) => e.post.id),
      filters,
      followingIds,
    );

    // Resets the boost of the older posts this page shows. Their rows are
    // newer than this session's anchor, so the session's later pages ignore
    // them. Best-effort: the page is already built.
    FeedRepo.recordResurfacings(
      page.filter((e) => e.resurfaced).map((e) => e.post.id),
    ).catch(() => {});

    return {
      posts: posts.map((p) => ({
        ...p,
        resurfaced: flags.get(p.id)?.resurfaced ?? false,
        isFeatured: flags.get(p.id)?.featured ?? false,
      })),
      nextCursor:
        offset + limit < ranked.length
          ? encodeForYouCursor({ seed, anchor, offset: offset + limit })
          : null,
      // Posts after this moment aren't in the session; clients ask
      // `new-count?since=<anchor>` for them. Server time, so client clock
      // skew can't hide or double-count a post.
      anchor: anchor.toISOString(),
    };
  }

  /**
   * Deletes resurfacing rows past the boost cap, keeping each post's latest
   * (the only one a boost reads). Run daily by the prune job.
   */
  static async pruneResurfacings(now: Date = new Date()) {
    return FeedRepo.pruneResurfacings(
      new Date(now.getTime() - RESURFACE_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    );
  }

  /** How many posts newer than `since` the viewer may see, for the "New posts" pill. */
  static async countNewPosts(filters: FeedFilters, since: Date) {
    const followingIds: Set<string> = filters.viewerId
      ? await FeedRepo.getFollowingIds(filters.viewerId)
      : new Set();
    return FeedRepo.countPostsSince(filters, followingIds, since);
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
          user.roleType.includes("providerFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new AppError(
            "Unauthorized: Provider or Partner role required",
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
          user.roleType.includes("providerFoxer") ||
          user.roleType.includes("investor");
        if (!isAuthorized) {
          throw new AppError(
            "Unauthorized: Provider or Partner role required",
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
    broadcastNewPost(post);
    if (mediaTags && mediaTags.length > 0) {
      notifyMediaTags(mediaTags, user.userId, post.id).catch(() => {});
    }

    // 3. Award Tokens via RewardService (with daily anti-spam cap and idempotency).
    // Foxer posts paid XP only, which is retired, so they pay nothing.
    try {
      const { default: RewardService } =
        await import("../reward/reward.service");
      if (type === PostType.citizen_experience) {
        await RewardService.grant({
          userId: user.userId,
          path: UserPath.user,
          action: "post_feed",
          refType: "post",
          refId: post.id,
        });
      } else if (type === PostType.review_share) {
        await RewardService.grant({
          userId: user.userId,
          path: UserPath.user,
          action: "share_review_post",
          refType: "post",
          refId: post.id,
        });
      }
    } catch (rewardError) {
      console.warn(
        "[FeedService] Best-effort reward grant failed:",
        rewardError,
      );
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

    await FeedRepo.incrementReposts(postId);
    broadcastNewPost(post);

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

  // Matches the client's flush size; the controller rejects larger batches.
  static readonly MAX_VIEW_BATCH = 50;

  // Once per (post, viewer); authors' own views, and posts the viewer can't
  // see, are skipped in the repository query. Returns the ids counted.
  static async recordViews(viewerId: string, postIds: string[]) {
    const unique = [...new Set(postIds)].slice(0, FeedService.MAX_VIEW_BATCH);
    return FeedRepo.recordViews(viewerId, unique);
  }

  // One share per signed-in user per post (enforced by the database, see
  // FeedRepo.recordShare). Guests can still copy a link; they just aren't
  // counted, since there is no one to hold to "once". A post the viewer
  // can't see is a 404, as on getPostById.
  static async trackShare(postId: string, viewerId?: string) {
    const post = await FeedRepo.findPostById(postId, viewerId);
    if (!post) {
      throw notFound("Post");
    }
    if (!viewerId) {
      return { success: true, counted: false, sharesCount: post.sharesCount };
    }
    const result = await FeedRepo.recordShare(postId, viewerId);
    return { success: true, ...result };
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
      const name = await actorName(user.userId);
      NotificationService.create({
        userId: post.authorId,
        type: "feed:like",
        title: "New Reaction on your Republic Post",
        message: `${name} reacted to your post.`,
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

    let parentAuthorId: string | undefined;
    if (parentId) {
      const parent = await FeedRepo.findCommentById(parentId);
      if (!parent || parent.postId !== postId) {
        throw notFound("Parent comment");
      }
      if (parent.parentId) {
        throw new AppError("Cannot reply to a reply", 400);
      }
      parentAuthorId = parent.authorId;
    }

    const comment = await FeedRepo.createComment(
      postId,
      user.userId,
      trimmed,
      parentId,
    );

    broadcastCommentsCount(postId);

    notifyMentions(trimmed, user.userId, {
      postId,
      commentId: comment.id,
    }).catch(() => {});

    const name = await actorName(user.userId);
    const preview = `"${trimmed.slice(0, 60)}${trimmed.length > 60 ? "..." : ""}"`;

    // Whoever was replied to hears about it, unless they are the post's
    // author (who is told about the comment below) or the one replying.
    if (
      parentAuthorId &&
      parentAuthorId !== user.userId &&
      parentAuthorId !== post.authorId
    ) {
      NotificationService.create({
        userId: parentAuthorId,
        type: "feed:reply",
        title: "New reply to your comment",
        message: `${name} replied to your comment: ${preview}`,
        metadata: { postId, commentId: comment.id, authorId: user.userId },
      }).catch((err) =>
        console.warn(
          "[FeedService] Best-effort reply notification failed:",
          err,
        ),
      );
    }

    // Notify post author if not self
    if (post.authorId !== user.userId) {
      NotificationService.create({
        userId: post.authorId,
        type: "feed:comment",
        title: "New Comment on your Republic Post",
        message: `${name} commented on your post: ${preview}`,
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

    const deleted = await FeedRepo.deleteComment(commentId);
    broadcastCommentsCount(deleted.postId);
    return deleted;
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
