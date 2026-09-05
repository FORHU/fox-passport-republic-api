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

    const posts = await prisma.post.findMany({
      where,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
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
    });

    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    const formatted = items.map((p) => {
      const isLikedByMe = viewerId ? (p.likes?.length ?? 0) > 0 : false;
      const { likes: _likes, ...rest } = p;
      return {
        ...rest,
        isLikedByMe,
      };
    });

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
    const { likes: _likes, ...rest } = post;
    return {
      ...rest,
      isLikedByMe,
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
