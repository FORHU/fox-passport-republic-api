import { prisma } from "../../utils/prisma";
import { PostType, FeedTab, Prisma } from "@prisma/client";

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

    const where: Prisma.PostWhereInput = {
      isArchived: false,
    };

    if (tab) where.tab = tab;
    if (type) where.type = type;
    if (authorId) where.authorId = authorId;

    if (search && search.trim().length > 0) {
      const term = search.trim();
      where.OR = [
        { content: { contains: term, mode: "insensitive" } },
        { author: { name: { contains: term, mode: "insensitive" } } },
        { author: { username: { contains: term, mode: "insensitive" } } },
      ];
    }

    const isTopMode = mode === "top";
    const take = isTopMode ? 500 : limit + 1; // candidate window for top mode

    // Fetched once here (regardless of mode) rather than per-post, so
    // rendering N posts from M distinct authors costs one query instead of
    // one follow-status lookup per author on the client.
    const [posts, followingIds] = await Promise.all([
      prisma.post.findMany({
        where,
        take,
        skip: !isTopMode && cursor ? 1 : 0,
        cursor: !isTopMode && cursor ? { id: cursor } : undefined,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        include: {
          author: AUTHOR_SELECT,
          ...ENTITY_INCLUDE,
          ...(viewerId
            ? {
                likes: {
                  where: { userId: viewerId },
                  select: { userId: true },
                },
              }
            : {}),
        },
      }),
      viewerId
        ? prisma.follow
            .findMany({
              where: { followerId: viewerId },
              select: { followingId: true },
            })
            .then((rows) => new Set(rows.map((f) => f.followingId)))
        : Promise.resolve(new Set<string>()),
    ]);

    let formatted = posts.map((p) => {
      const isLikedByMe = viewerId ? (p.likes?.length ?? 0) > 0 : false;
      const isFollowingAuthor = viewerId ? followingIds.has(p.authorId) : false;
      const { likes: _likes, ...rest } = p;
      return {
        ...rest,
        isLikedByMe,
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

  static async findPostById(id: string, viewerId?: string) {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: AUTHOR_SELECT,
        ...ENTITY_INCLUDE,
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { userId: true },
              },
            }
          : {}),
      },
    });

    if (!post) return null;

    const isLikedByMe = viewerId ? (post.likes?.length ?? 0) > 0 : false;
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
      isLikedByMe,
      isFollowingAuthor,
    };
  }

  static async createPost(data: {
    authorId: string;
    type: PostType;
    tab: FeedTab;
    content: string;
    mediaUrls?: string[];
    venueId?: string | null;
    assetId?: string | null;
    serviceId?: string | null;
    eventId?: string | null;
    reviewId?: string | null;
    stampId?: string | null;
  }) {
    return prisma.post.create({
      data: {
        authorId: data.authorId,
        type: data.type,
        tab: data.tab,
        content: data.content,
        mediaUrls: data.mediaUrls || [],
        venueId: data.venueId || null,
        assetId: data.assetId || null,
        serviceId: data.serviceId || null,
        eventId: data.eventId || null,
        reviewId: data.reviewId || null,
        stampId: data.stampId || null,
      },
      include: {
        author: AUTHOR_SELECT,
        ...ENTITY_INCLUDE,
      },
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

  static async toggleLike(postId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.postLike.findUnique({
        where: {
          postId_userId: { postId, userId },
        },
      });

      if (existing) {
        await tx.postLike.delete({
          where: {
            postId_userId: { postId, userId },
          },
        });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        });
        return { liked: false, likesCount: Math.max(0, updated.likesCount) };
      } else {
        await tx.postLike.create({
          data: { postId, userId },
        });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { likesCount: { increment: 1 } },
          select: { likesCount: true },
        });
        return { liked: true, likesCount: updated.likesCount };
      }
    });
  }

  static async findComments(postId: string, limit = 50, cursor?: string) {
    return prisma.postComment.findMany({
      where: { postId },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            imgId: true,
            roleType: true,
          },
        },
      },
    });
  }

  static async createComment(
    postId: string,
    authorId: string,
    content: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.create({
        data: {
          postId,
          authorId,
          content,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              imgId: true,
              roleType: true,
            },
          },
        },
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
      const comment = await tx.postComment.delete({
        where: { id },
      });

      await tx.post.update({
        where: { id: comment.postId },
        data: { commentsCount: { decrement: 1 } },
      });

      return comment;
    });
  }
}
