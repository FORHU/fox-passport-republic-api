import { prisma } from "../../utils/prisma";
import {
  PostType,
  FeedTab,
  Prisma,
  PostVisibility,
  ReactionType,
} from "@prisma/client";

const COMMENT_AUTHOR_SELECT = {
  select: {
    id: true,
    name: true,
    username: true,
    imgId: true,
    roleType: true,
  },
} as const;

const REPOST_SELECT = {
  select: {
    id: true,
    content: true,
    mediaUrls: true,
    type: true,
    createdAt: true,
    author: {
      select: { id: true, name: true, username: true, imgId: true },
    },
  },
} as const;

const AUTHOR_SELECT = {
  select: {
    id: true,
    name: true,
    username: true,
    imgId: true,
    roleType: true,
    systemRole: true,
    passport: {
      select: {
        id: true,
        paths: {
          select: {
            path: true,
            level: true,
            totalXP: true,
          },
        },
        userBadges: {
          select: {
            badge: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
                rarity: true,
              },
            },
          },
        },
        stamps: {
          select: {
            id: true,
            eventName: true,
            imageUrl: true,
            venueId: true,
          },
          take: 5,
        },
      },
    },
  },
} as const;

const ENTITY_INCLUDE = {
  venue: {
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      billingRate: true,
      capacity: true,
      city: true,
      state: true,
      stampIconUrl: true,
      images: {
        select: { id: true, url: true },
        take: 3,
      },
    },
  },
  asset: {
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      billingRate: true,
      condition: true,
      city: true,
      images: {
        select: { id: true, url: true },
        take: 3,
      },
    },
  },
  service: {
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      billingRate: true,
      city: true,
      tags: true,
      images: {
        select: { id: true, url: true },
        take: 3,
      },
    },
  },
  event: {
    select: {
      id: true,
      name: true,
      description: true,
      eventCategory: true,
      startAt: true,
      endAt: true,
      guestCount: true,
      totalAmount: true,
      targetCity: true,
    },
  },
  review: {
    select: {
      id: true,
      rating: true,
      comment: true,
      entityId: true,
      entityType: true,
      createdAt: true,
    },
  },
  stamp: {
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      location: true,
      imageUrl: true,
      venueId: true,
      venue: {
        select: {
          id: true,
          name: true,
          city: true,
        },
      },
    },
  },
} as const;

export interface QueryFeedOptions {
  tab?: FeedTab;
  type?: PostType;
  authorId?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  viewerId?: string;
  mode?: "recent" | "top";
}

export default class FeedRepo {
  static async findPosts(options: QueryFeedOptions) {
    const {
      tab,
      type,
      authorId,
      search,
      limit = 20,
      cursor,
      viewerId,
      mode = "recent",
    } = options;

    // Fetched upfront (not just for this batch's authors) because it now
    // also gates *which* posts are visible at all — a "followers"-visibility
    // post from someone the viewer doesn't follow must never reach the
    // query results, not just render differently once it does.
    const followingIds: Set<string> = viewerId
      ? await FeedRepo.getFollowingIds(viewerId)
      : new Set();

    const andClauses: Prisma.PostWhereInput[] = [{ isArchived: false }];
    if (tab) andClauses.push({ tab });
    if (type) andClauses.push({ type });
    if (authorId) andClauses.push({ authorId });

    if (search && search.trim().length > 0) {
      const term = search.trim();
      andClauses.push({
        OR: [
          { content: { contains: term, mode: "insensitive" } },
          { author: { name: { contains: term, mode: "insensitive" } } },
          { author: { username: { contains: term, mode: "insensitive" } } },
        ],
      });
    }

    const visibilityOr: Prisma.PostWhereInput[] = [
      { visibility: PostVisibility.public },
    ];
    if (viewerId) {
      visibilityOr.push({ authorId: viewerId });
      if (followingIds.size > 0) {
        visibilityOr.push({
          visibility: PostVisibility.followers,
          authorId: { in: [...followingIds] },
        });
      }
    }
    andClauses.push({ OR: visibilityOr });

    if (viewerId) {
      andClauses.push({ hiddenFor: { none: { userId: viewerId } } });
    }

    const where: Prisma.PostWhereInput = { AND: andClauses };

    const isTopMode = mode === "top";
    const take = isTopMode ? 500 : limit + 1; // candidate window for top mode

    const posts = await prisma.post.findMany({
      where,
      take,
      skip: !isTopMode && cursor ? 1 : 0,
      cursor: !isTopMode && cursor ? { id: cursor } : undefined,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: AUTHOR_SELECT,
        ...ENTITY_INCLUDE,
        originalPost: REPOST_SELECT,
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { userId: true, type: true },
              },
            }
          : {}),
      },
    });

    let formatted = posts.map((p) => {
      const myReaction = viewerId ? p.likes?.[0] : undefined;
      const isFollowingAuthor = viewerId ? followingIds.has(p.authorId) : false;
      const { likes: _likes, ...rest } = p;
      return {
        ...rest,
        isLikedByMe: !!myReaction,
        myReaction: myReaction?.type ?? null,
        isFollowingAuthor,
      };
    });

    let nextCursor = null;

    if (isTopMode) {
      const now = Date.now();
      formatted.forEach((p: any) => {
        let score = 0;

        // Affinity
        if (followingIds.has(p.authorId)) score += 50;
        if (p.authorId === viewerId) score += 50;

        // Engagement
        score += (p.likesCount || 0) * 2;
        score += (p.commentsCount || 0) * 5;
        score += (p.sharesCount || 0) * 10;

        // Decay (Linear/Exponential proxy)
        const hoursOld =
          (now - new Date(p.createdAt).getTime()) / (1000 * 60 * 60);
        // Reduce score smoothly based on age. Avoid negative infinity for very old posts.
        const decayPenalty = Math.min(hoursOld * 1.5, 100);
        score -= decayPenalty;

        p._score = score;
      });

      // Sort by score
      formatted.sort((a: any, b: any) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b._score - a._score;
      });

      // Paginate in-memory array
      const cursorIndex = cursor
        ? formatted.findIndex((p) => p.id === cursor)
        : -1;
      const startIndex = cursorIndex !== -1 ? cursorIndex + 1 : 0;

      const paged = formatted.slice(startIndex, startIndex + limit);
      nextCursor =
        startIndex + limit < formatted.length
          ? formatted[startIndex + limit - 1].id
          : null;
      formatted = paged;
    } else {
      const hasNextPage = posts.length > limit;
      const items = hasNextPage ? formatted.slice(0, limit) : formatted;
      nextCursor = hasNextPage ? items[items.length - 1].id : null;
      formatted = items;
    }

    // Clean up temporary score property
    formatted.forEach((p: any) => delete p._score);

    return {
      posts: formatted,
      nextCursor,
    };
  }

  static async getFollowingIds(userId: string): Promise<Set<string>> {
    const rows = await prisma.follow.findMany({
      where: { followerId: userId, status: "accepted" },
      select: { followingId: true },
    });
    return new Set(rows.map((f) => f.followingId));
  }

  // Whether `viewerId` is allowed to see `post` at all — same gate as the
  // list query's visibility OR, applied to a single already-fetched post
  // (getPostById fetches by id directly, so it can't filter in the WHERE
  // the way the list query does).
  static async canView(
    post: { authorId: string; visibility: PostVisibility },
    viewerId?: string,
  ): Promise<boolean> {
    if (post.visibility === PostVisibility.public) return true;
    if (!viewerId) return false;
    if (post.authorId === viewerId) return true;
    if (post.visibility === PostVisibility.only_me) return false;
    const isFollowing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: post.authorId,
        },
      },
    });
    return isFollowing?.status === "accepted";
  }

  static async findPostById(id: string, viewerId?: string) {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: AUTHOR_SELECT,
        ...ENTITY_INCLUDE,
        originalPost: REPOST_SELECT,
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { userId: true, type: true },
              },
            }
          : {}),
      },
    });

    if (!post) return null;
    if (!(await FeedRepo.canView(post, viewerId))) return null;

    const myReaction = viewerId ? post.likes?.[0] : undefined;
    const isFollowingAuthor = viewerId
      ? await prisma.follow
          .findUnique({
            where: {
              followerId_followingId: {
                followerId: viewerId,
                followingId: post.authorId,
              },
            },
          })
          .then((f) => !!f)
      : false;
    const { likes: _likes, ...rest } = post;
    return {
      ...rest,
      isLikedByMe: !!myReaction,
      myReaction: myReaction?.type ?? null,
      isFollowingAuthor,
    };
  }

  static async createPost(data: {
    authorId: string;
    type: PostType;
    tab: FeedTab;
    content: string;
    mediaUrls?: string[];
    visibility?: PostVisibility;
    venueId?: string | null;
    assetId?: string | null;
    serviceId?: string | null;
    eventId?: string | null;
    reviewId?: string | null;
    stampId?: string | null;
    originalPostId?: string | null;
  }) {
    return prisma.post.create({
      data: {
        authorId: data.authorId,
        type: data.type,
        tab: data.tab,
        content: data.content,
        mediaUrls: data.mediaUrls || [],
        visibility: data.visibility || PostVisibility.public,
        venueId: data.venueId || null,
        assetId: data.assetId || null,
        serviceId: data.serviceId || null,
        eventId: data.eventId || null,
        reviewId: data.reviewId || null,
        stampId: data.stampId || null,
        originalPostId: data.originalPostId || null,
      },
      include: {
        author: AUTHOR_SELECT,
        ...ENTITY_INCLUDE,
        originalPost: REPOST_SELECT,
      },
    });
  }

  static async updatePost(
    id: string,
    data: {
      content?: string;
      mediaUrls?: string[];
      visibility?: PostVisibility;
    },
  ) {
    return prisma.post.update({
      where: { id },
      data: { ...data, editedAt: new Date() },
      include: {
        author: AUTHOR_SELECT,
        ...ENTITY_INCLUDE,
        originalPost: REPOST_SELECT,
      },
    });
  }

  static async incrementShares(id: string) {
    return prisma.post.update({
      where: { id },
      data: { sharesCount: { increment: 1 } },
    });
  }

  static async deletePost(id: string) {
    return prisma.post.delete({
      where: { id },
    });
  }

  static async countUserPostsToday(authorId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return prisma.post.count({
      where: {
        authorId,
        createdAt: { gte: startOfDay },
      },
    });
  }

  static async countUserPosts(authorId: string): Promise<number> {
    return prisma.post.count({ where: { authorId } });
  }

  // `type: null` removes the reaction entirely; otherwise sets/replaces it
  // — one reaction per user per post, so re-reacting with a different emoji
  // swaps the row instead of stacking, matching Facebook's reaction model.
  static async setReaction(
    postId: string,
    userId: string,
    type: ReactionType | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.postLike.findUnique({
        where: { postId_userId: { postId, userId } },
      });

      if (!type) {
        if (!existing) {
          const post = await tx.post.findUniqueOrThrow({
            where: { id: postId },
            select: { likesCount: true },
          });
          return { reaction: null, likesCount: post.likesCount };
        }
        await tx.postLike.delete({
          where: { postId_userId: { postId, userId } },
        });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        });
        return { reaction: null, likesCount: Math.max(0, updated.likesCount) };
      }

      if (existing) {
        await tx.postLike.update({
          where: { postId_userId: { postId, userId } },
          data: { type },
        });
        const post = await tx.post.findUniqueOrThrow({
          where: { id: postId },
          select: { likesCount: true },
        });
        return { reaction: type, likesCount: post.likesCount };
      }

      await tx.postLike.create({ data: { postId, userId, type } });
      const updated = await tx.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      });
      return { reaction: type, likesCount: updated.likesCount };
    });
  }

  static async getReactionBreakdown(postId: string) {
    const rows = await prisma.postLike.groupBy({
      by: ["type"],
      where: { postId },
      _count: { type: true },
    });
    return rows.map((r) => ({ type: r.type, count: r._count.type }));
  }

  static async toggleSave(postId: string, userId: string) {
    const existing = await prisma.savedPost.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await prisma.savedPost.delete({
        where: { postId_userId: { postId, userId } },
      });
      return { saved: false };
    }
    await prisma.savedPost.create({ data: { postId, userId } });
    return { saved: true };
  }

  static async findSavedPosts(userId: string, limit = 20, cursor?: string) {
    const saved = await prisma.savedPost.findMany({
      where: { userId },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor
        ? { postId_userId: { postId: cursor, userId } }
        : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        post: {
          include: {
            author: AUTHOR_SELECT,
            ...ENTITY_INCLUDE,
            originalPost: REPOST_SELECT,
          },
        },
      },
    });
    return saved.map((s) => s.post);
  }

  static async hidePost(postId: string, userId: string) {
    await prisma.hiddenPost.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
  }

  static async findComments(
    postId: string,
    limit = 50,
    cursor?: string,
    viewerId?: string,
  ) {
    const comments = await prisma.postComment.findMany({
      // Top-level only — replies come nested below, one level, same as
      // Facebook/Messenger rather than a full arbitrary-depth thread.
      where: { postId, parentId: null },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "asc" },
      include: {
        author: COMMENT_AUTHOR_SELECT,
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: COMMENT_AUTHOR_SELECT,
            ...(viewerId
              ? {
                  likes: {
                    where: { userId: viewerId },
                    select: { userId: true },
                  },
                }
              : {}),
          },
        },
        ...(viewerId
          ? { likes: { where: { userId: viewerId }, select: { userId: true } } }
          : {}),
      },
    });

    const withLikeFlag = (c: any) => {
      const isLikedByMe = viewerId ? (c.likes?.length ?? 0) > 0 : false;
      const { likes: _likes, ...rest } = c;
      return { ...rest, isLikedByMe };
    };

    return comments.map((c: any) => ({
      ...withLikeFlag(c),
      replies: c.replies.map(withLikeFlag),
    }));
  }

  static async createComment(
    postId: string,
    authorId: string,
    content: string,
    parentId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.create({
        data: { postId, authorId, content, parentId },
        include: { author: COMMENT_AUTHOR_SELECT },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      });

      return comment;
    });
  }

  static async findCommentById(id: string) {
    return prisma.postComment.findUnique({
      where: { id },
    });
  }

  static async deleteComment(id: string) {
    return prisma.$transaction(async (tx) => {
      // A top-level comment's replies cascade at the DB level (onDelete:
      // Cascade on parentId), but commentsCount is a manual counter, so
      // deleting a parent must also account for however many replies just
      // went with it.
      const replyCount = await tx.postComment.count({
        where: { parentId: id },
      });
      const comment = await tx.postComment.delete({
        where: { id },
      });

      await tx.post.update({
        where: { id: comment.postId },
        data: { commentsCount: { decrement: 1 + replyCount } },
      });

      return comment;
    });
  }

  static async toggleCommentLike(commentId: string, userId: string) {
    const existing = await prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    return prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.commentLike.delete({
          where: { commentId_userId: { commentId, userId } },
        });
        const updated = await tx.postComment.update({
          where: { id: commentId },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        });
        return { liked: false, likesCount: Math.max(0, updated.likesCount) };
      }
      await tx.commentLike.create({ data: { commentId, userId } });
      const updated = await tx.postComment.update({
        where: { id: commentId },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      });
      return { liked: true, likesCount: updated.likesCount };
    });
  }

  // @mention autocomplete — plain prefix match on name/username, capped
  // small since this backs a live-typing dropdown, not a search page.
  static async searchMentionCandidates(query: string, limit = 8) {
    return prisma.user.findMany({
      where: {
        OR: [
          { name: { startsWith: query, mode: "insensitive" } },
          { username: { startsWith: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, username: true, imgId: true },
      take: limit,
    });
  }
}
