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

const MEDIA_TAG_INCLUDE = {
  include: {
    user: {
      select: { id: true, name: true, username: true, imgId: true },
    },
  },
  orderBy: { createdAt: "asc" as const },
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
        paths: { select: { path: true } },
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
  // Voter ids are included rather than gated behind a viewerId-conditional
  // (unlike PostLike above) so this one const can be spread as-is into every
  // existing query site — the frontend derives "did I vote" from the ids
  // itself. A community feed's vote lists are small enough that this is a
  // non-issue, unlike a public platform's polls.
  poll: {
    select: {
      id: true,
      options: {
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          label: true,
          position: true,
          votesCount: true,
          votes: { select: { userId: true } },
        },
      },
    },
  },
} as const;

export interface FeedFilters {
  tab?: FeedTab;
  type?: PostType;
  authorId?: string;
  search?: string;
  viewerId?: string;
}

export interface QueryFeedOptions extends FeedFilters {
  limit?: number;
  cursor?: string;
  /**
   * Newest first. `pinnedFirst` keeps the original order (pinned posts on
   * top), which is what a request without a `mode` gets, so older mobile
   * builds keep working; an explicit `mode=recent` is strictly newest-first.
   */
  pinnedFirst?: boolean;
}

/** The few columns the For you ranking reads, for hundreds of posts at once. */
const RANKABLE_SELECT = {
  id: true,
  authorId: true,
  createdAt: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
} as const;

export type RankableRow = Prisma.PostGetPayload<{
  select: typeof RANKABLE_SELECT;
}>;

export default class FeedRepo {
  /**
   * Who may see what, shared by every feed query (Recent, both For you pools,
   * the featured pick and the new-posts count) so none of them can drift: a
   * "followers"-visibility post from someone the viewer doesn't follow must
   * never reach any of them.
   */
  private static buildFeedWhere(
    filters: FeedFilters,
    followingIds: Set<string>,
  ): Prisma.PostWhereInput {
    const { tab, type, authorId, search, viewerId } = filters;

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

    return { AND: andClauses };
  }

  private static postInclude(viewerId?: string) {
    return {
      author: AUTHOR_SELECT,
      ...ENTITY_INCLUDE,
      originalPost: REPOST_SELECT,
      mediaTags: MEDIA_TAG_INCLUDE,
      ...(viewerId
        ? {
            likes: {
              where: { userId: viewerId },
              select: { userId: true, type: true },
            },
          }
        : {}),
    } satisfies Prisma.PostInclude;
  }

  /** The viewer's own reaction, follow state and reaction counts, per post. */
  private static async formatPosts<
    T extends {
      id: string;
      authorId: string;
      likes?: { type: ReactionType }[];
    },
  >(posts: T[], viewerId: string | undefined, followingIds: Set<string>) {
    const reactionCounts = await FeedRepo.findReactionCounts(
      posts.map((p) => p.id),
    );
    return posts.map((p) => {
      const myReaction = viewerId ? p.likes?.[0] : undefined;
      const { likes: _likes, ...rest } = p;
      return {
        ...rest,
        isLikedByMe: !!myReaction,
        myReaction: myReaction?.type ?? null,
        isFollowingAuthor: viewerId ? followingIds.has(p.authorId) : false,
        reactionCounts: reactionCounts.get(p.id) ?? [],
      };
    });
  }

  /** Recent: newest first, paged by post id. */
  static async findPosts(options: QueryFeedOptions) {
    const { limit = 20, cursor, viewerId, pinnedFirst = false } = options;

    // Fetched upfront (not just for this batch's authors) because it also
    // gates *which* posts are visible at all.
    const followingIds: Set<string> = viewerId
      ? await FeedRepo.getFollowingIds(viewerId)
      : new Set();

    const posts = await prisma.post.findMany({
      where: FeedRepo.buildFeedWhere(options, followingIds),
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: pinnedFirst
        ? [{ isPinned: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      include: FeedRepo.postInclude(viewerId),
    });

    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;
    return {
      posts: await FeedRepo.formatPosts(items, viewerId, followingIds),
      nextCursor: hasNextPage ? items[items.length - 1].id : null,
    };
  }

  /**
   * Everything the For you ranking needs for one session, as light rows:
   * - `fresh`: the newest `freshSize` posts at or before the anchor.
   * - `older`: every post older than those, each with its latest resurfacing
   *   at or before the anchor. Rows written after the anchor are ignored, so a
   *   session's own writes never change the list it is paging through.
   * - `pinned`: the pinned posts at or before the anchor, for the featured spot.
   */
  static async findRankingCandidates(
    filters: FeedFilters,
    followingIds: Set<string>,
    anchor: Date,
    freshSize: number,
  ) {
    const where = FeedRepo.buildFeedWhere(filters, followingIds);
    const atOrBeforeAnchor: Prisma.PostWhereInput = {
      AND: [where, { createdAt: { lte: anchor } }],
    };

    const [fresh, pinned] = await Promise.all([
      prisma.post.findMany({
        where: atOrBeforeAnchor,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: freshSize,
        select: RANKABLE_SELECT,
      }),
      prisma.post.findMany({
        where: { AND: [atOrBeforeAnchor, { isPinned: true }] },
        select: RANKABLE_SELECT,
      }),
    ]);

    const oldestFresh = fresh[fresh.length - 1];
    if (fresh.length < freshSize || !oldestFresh) {
      return { fresh, older: [], pinned };
    }

    const olderRows = await prisma.post.findMany({
      where: {
        AND: [
          atOrBeforeAnchor,
          {
            OR: [
              { createdAt: { lt: oldestFresh.createdAt } },
              { createdAt: oldestFresh.createdAt, id: { lt: oldestFresh.id } },
            ],
          },
        ],
      },
      select: {
        ...RANKABLE_SELECT,
        resurfacings: {
          where: { shownAt: { lte: anchor } },
          orderBy: { shownAt: "desc" },
          take: 1,
          select: { shownAt: true },
        },
      },
    });

    const older = olderRows.map(({ resurfacings, ...p }) => ({
      ...p,
      lastShownAt: resurfacings[0]?.shownAt ?? null,
    }));
    return { fresh, older, pinned };
  }

  /** Full posts for one page, in the order given. Ids no longer visible are dropped. */
  static async findPostsByIds(
    ids: string[],
    filters: FeedFilters,
    followingIds: Set<string>,
  ) {
    if (ids.length === 0) return [];
    const { viewerId } = filters;
    const rows = await prisma.post.findMany({
      where: {
        AND: [
          FeedRepo.buildFeedWhere(filters, followingIds),
          { id: { in: ids } },
        ],
      },
      include: FeedRepo.postInclude(viewerId),
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    return FeedRepo.formatPosts(ordered, viewerId, followingIds);
  }

  /** Posts newer than `since` the viewer may see, excluding their own. */
  static async countPostsSince(
    filters: FeedFilters,
    followingIds: Set<string>,
    since: Date,
  ): Promise<number> {
    const and: Prisma.PostWhereInput[] = [
      FeedRepo.buildFeedWhere(filters, followingIds),
      { createdAt: { gt: since } },
    ];
    if (filters.viewerId) and.push({ authorId: { not: filters.viewerId } });
    return prisma.post.count({ where: { AND: and } });
  }

  static async recordResurfacings(postIds: string[]): Promise<void> {
    if (postIds.length === 0) return;
    await prisma.postResurfacing.createMany({
      data: postIds.map((postId) => ({ postId })),
    });
  }

  /**
   * Deletes resurfacing rows older than `before`, keeping each post's latest:
   * only the latest one counts toward a boost, and once it is older than the
   * cap's ~10.3 days no older row can change anything.
   */
  static async pruneResurfacings(before: Date): Promise<number> {
    return prisma.$executeRaw`
      DELETE FROM "post_resurfacings" r
      WHERE r."shownAt" < ${before}
        AND EXISTS (
          SELECT 1 FROM "post_resurfacings" newer
          WHERE newer."postId" = r."postId" AND newer."shownAt" > r."shownAt"
        )`;
  }

  /**
   * How many of each reaction every post in [postIds] has, most chosen first,
   * so a client can show the post's reaction emojis beside its total. One
   * grouped query for the whole page; posts with no reactions are absent.
   */
  static async findReactionCounts(
    postIds: string[],
  ): Promise<Map<string, { type: string; count: number }[]>> {
    const counts = new Map<string, { type: string; count: number }[]>();
    if (postIds.length === 0) return counts;
    const rows = await prisma.postLike.groupBy({
      by: ["postId", "type"],
      where: { postId: { in: postIds } },
      _count: { type: true },
    });
    for (const r of rows) {
      const list = counts.get(r.postId) ?? [];
      list.push({ type: r.type, count: r._count.type });
      counts.set(r.postId, list);
    }
    for (const list of counts.values()) list.sort((a, b) => b.count - a.count);
    return counts;
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
        mediaTags: MEDIA_TAG_INCLUDE,
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
    const reactionCounts = await FeedRepo.findReactionCounts([post.id]);
    return {
      ...rest,
      isLikedByMe: !!myReaction,
      myReaction: myReaction?.type ?? null,
      reactionCounts: reactionCounts.get(post.id) ?? [],
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
    mediaTags?: { mediaUrl: string; userId: string; x: number; y: number }[];
    pollOptions?: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
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
      });

      if (data.mediaTags && data.mediaTags.length > 0) {
        await tx.postMediaTag.createMany({
          data: data.mediaTags.map((t) => ({
            postId: post.id,
            mediaUrl: t.mediaUrl,
            userId: t.userId,
            x: t.x,
            y: t.y,
          })),
        });
      }

      if (data.pollOptions && data.pollOptions.length > 0) {
        await tx.poll.create({
          data: {
            postId: post.id,
            options: {
              create: data.pollOptions.map((label, position) => ({
                label,
                position,
              })),
            },
          },
        });
      }

      return tx.post.findUniqueOrThrow({
        where: { id: post.id },
        include: {
          author: AUTHOR_SELECT,
          ...ENTITY_INCLUDE,
          originalPost: REPOST_SELECT,
          mediaTags: MEDIA_TAG_INCLUDE,
        },
      });
    });
  }

  // Single-choice: casting a new vote first removes whichever option (if
  // any) this user had already voted for on the same poll, so a user is
  // never counted against two options at once.
  static async voteOnPoll(pollId: string, optionId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const previous = await tx.pollVote.findFirst({
        where: { userId, option: { pollId } },
        select: { pollOptionId: true },
      });

      if (previous?.pollOptionId === optionId) {
        // Voting for the option you already picked is a toggle-off.
        await tx.pollVote.delete({
          where: {
            pollOptionId_userId: { pollOptionId: optionId, userId },
          },
        });
        await tx.pollOption.update({
          where: { id: optionId },
          data: { votesCount: { decrement: 1 } },
        });
      } else {
        if (previous) {
          await tx.pollVote.delete({
            where: {
              pollOptionId_userId: {
                pollOptionId: previous.pollOptionId,
                userId,
              },
            },
          });
          await tx.pollOption.update({
            where: { id: previous.pollOptionId },
            data: { votesCount: { decrement: 1 } },
          });
        }
        await tx.pollVote.create({ data: { pollOptionId: optionId, userId } });
        await tx.pollOption.update({
          where: { id: optionId },
          data: { votesCount: { increment: 1 } },
        });
      }

      return tx.poll.findUniqueOrThrow({
        where: { id: pollId },
        select: {
          id: true,
          options: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              label: true,
              position: true,
              votesCount: true,
              votes: { select: { userId: true } },
            },
          },
        },
      });
    });
  }

  static async findPollOption(optionId: string) {
    return prisma.pollOption.findUnique({
      where: { id: optionId },
      include: { poll: true },
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
        mediaTags: MEDIA_TAG_INCLUDE,
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
      take: limit + 1,
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
            // The viewer's own reaction, so saved posts carry isLikedByMe and
            // myReaction like the feed list does (BUG-25).
            likes: {
              where: { userId },
              select: { userId: true, type: true },
            },
          },
        },
      },
    });
    const hasNextPage = saved.length > limit;
    const items = hasNextPage ? saved.slice(0, limit) : saved;
    const nextCursor = hasNextPage ? items[items.length - 1].postId : null;
    const reactionCounts = await FeedRepo.findReactionCounts(
      items.map(({ post }) => post.id),
    );
    const posts = items.map(({ post }) => {
      const { likes, ...rest } = post;
      const myReaction = likes[0];
      return {
        ...rest,
        isLikedByMe: !!myReaction,
        myReaction: myReaction?.type ?? null,
        reactionCounts: reactionCounts.get(post.id) ?? [],
      };
    });
    return { posts, nextCursor };
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

    function withLikeFlag<T extends { likes?: unknown[] | null }>(c: T) {
      const isLikedByMe = viewerId ? (c.likes?.length ?? 0) > 0 : false;
      const { likes: _likes, ...rest } = c;
      return { ...rest, isLikedByMe };
    }

    return comments.map((c) => ({
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

  /** The post's comment counter as stored and who may see the post, or null
   * if the post is gone. */
  static async findCommentsCount(postId: string) {
    return prisma.post.findUnique({
      where: { id: postId },
      select: { commentsCount: true, visibility: true },
    });
  }

  static async findCommentById(id: string) {
    return prisma.postComment.findUnique({
      where: { id },
    });
  }

  static async updateComment(id: string, content: string) {
    return prisma.postComment.update({
      where: { id },
      data: { content },
      include: { author: COMMENT_AUTHOR_SELECT },
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

  static async createMediaTag(
    postId: string,
    data: { mediaUrl: string; userId: string; x: number; y: number },
  ) {
    return prisma.postMediaTag.create({
      data: { postId, ...data },
      include: MEDIA_TAG_INCLUDE.include,
    });
  }

  static async findMediaTagById(id: string) {
    return prisma.postMediaTag.findUnique({ where: { id } });
  }

  static async deleteMediaTag(id: string) {
    return prisma.postMediaTag.delete({ where: { id } });
  }
}
