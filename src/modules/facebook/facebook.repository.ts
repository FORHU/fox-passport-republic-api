import { prisma } from "../../utils/prisma";
import type {
  FacebookConnectionStatus,
  FacebookShareStatus,
  Prisma,
} from "@prisma/client";

export default class FacebookRepository {
  static findConnection(userId: string) {
    return prisma.facebookConnection.findUnique({ where: { userId } });
  }

  /** Creates or replaces the Foxer's connection after the permission dialog. */
  static upsertConnection(
    userId: string,
    data: {
      facebookUserId: string;
      facebookUserName: string | null;
      userAccessTokenEnc: string;
      userTokenExpiresAt: Date | null;
      grantedScopes: string[];
    },
  ) {
    return prisma.facebookConnection.upsert({
      where: { userId },
      create: { userId, ...data, status: "active" },
      update: { ...data, status: "active" },
    });
  }

  static updateConnection(
    userId: string,
    data: Prisma.FacebookConnectionUpdateInput,
  ) {
    return prisma.facebookConnection.update({ where: { userId }, data });
  }

  static setConnectionStatus(userId: string, status: FacebookConnectionStatus) {
    return prisma.facebookConnection.updateMany({
      where: { userId },
      data: { status },
    });
  }

  static deleteConnection(userId: string) {
    return prisma.facebookConnection.deleteMany({ where: { userId } });
  }

  /** What sharing needs to know about a post, and nothing more. */
  static findPostForShare(postId: string) {
    return prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        content: true,
        mediaUrls: true,
        visibility: true,
        isArchived: true,
      },
    });
  }

  static findShare(postId: string, pageId: string) {
    return prisma.facebookShare.findUnique({
      where: { postId_pageId: { postId, pageId } },
    });
  }

  /** The Foxer's most recent share of a post, to any Page. */
  static findLatestShare(postId: string, userId: string) {
    return prisma.facebookShare.findFirst({
      where: { postId, userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** Throws P2002 when a share of this post to this Page already exists. */
  static createShare(data: {
    postId: string;
    userId: string;
    pageId: string;
    pageName: string | null;
  }) {
    return prisma.facebookShare.create({
      data: { ...data, status: "publishing" },
    });
  }

  /**
   * Takes a share back to `publishing` for another attempt, but only from one of
   * `fromStatuses` (and, for a stuck `publishing`, only when it is older than
   * `staleBefore`). Two clicks racing for the same row: one gets count 1, the
   * other 0, so the video is sent once.
   */
  static async claimShareForRetry(
    id: string,
    staleBefore: Date,
  ): Promise<boolean> {
    const { count } = await prisma.facebookShare.updateMany({
      where: {
        id,
        OR: [
          { status: "failed" },
          { status: "publishing", updatedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: "publishing",
        attempts: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
    });
    return count === 1;
  }

  static updateShare(
    id: string,
    data: {
      status?: FacebookShareStatus;
      facebookVideoId?: string | null;
      permalinkUrl?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      publishedAt?: Date | null;
      pageName?: string | null;
    },
  ) {
    return prisma.facebookShare.update({ where: { id }, data });
  }
}
