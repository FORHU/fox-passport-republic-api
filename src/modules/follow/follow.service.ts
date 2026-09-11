import FollowRepo from "./follow.repository";
import { followCache, FOLLOW_TTL } from "../../utils/cache-namespaces";
import BlockRepo from "../block/block.repository";
import {
  notifyFollowRequest,
  notifyNewFollower,
  notifyFollowAccepted,
} from "../notifications/follow-notification";

export default class FollowService {
  static async sendFollow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new Error("You cannot follow yourself");
    }

    const existing = await FollowRepo.findRow(followerId, followingId);
    if (existing) {
      return { status: existing.status };
    }

    const isBlocked = await BlockRepo.isBlockedEitherWay(
      followerId,
      followingId,
    );
    if (isBlocked) {
      const err = new Error("You can't follow this citizen.");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }

    const [me, target] = await Promise.all([
      FollowRepo.getUserBasic(followerId),
      FollowRepo.getUserBasic(followingId),
    ]);
    if (!target) {
      throw new Error("User not found");
    }

    const status = target.isPrivate ? "pending" : "accepted";
    await FollowRepo.create(followerId, followingId, status);

    if (status === "pending") {
      notifyFollowRequest({
        targetUserId: followingId,
        requesterId: followerId,
        requesterName: me?.name ?? "Someone",
      });
    } else {
      notifyNewFollower({
        targetUserId: followingId,
        followerId,
        followerName: me?.name ?? "Someone",
      });
    }

    return { status };
  }

  static async removeFollow(followerId: string, followingId: string) {
    await FollowRepo.delete(followerId, followingId);
    return { status: "none" as const };
  }

  static async acceptRequest(followingId: string, requesterId: string) {
    const result = await FollowRepo.accept(requesterId, followingId);
    if (result.count === 0) {
      throw new Error("No pending request from this citizen");
    }

    const accepter = await FollowRepo.getUserBasic(followingId);
    notifyFollowAccepted({
      requesterUserId: requesterId,
      accepterId: followingId,
      accepterName: accepter?.name ?? "Someone",
    });

    return { status: "accepted" as const };
  }

  static async declineRequest(followingId: string, requesterId: string) {
    await FollowRepo.delete(requesterId, followingId);
    return { status: "none" as const };
  }

  static async getRequests(userId: string, page: number, limit: number) {
    const { rows, total } = await followCache.cached(
      `requests:${userId}:${page}:${limit}`,
      FOLLOW_TTL,
      () => FollowRepo.getRequests(userId, page, limit),
    );
    return {
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async getFollowers(
    viewerId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    // The visibility check runs on every call, outside the cache. It decides
    // who may see a private account's list, and a cached `isAcceptedFollower`
    // would keep answering yes for a minute after the follow was withdrawn.
    await this.assertListVisible(viewerId, userId);
    // The rows themselves are the same for everyone allowed to see them, so
    // the viewer is not part of the key - the check above is what varies.
    const { rows, total } = await followCache.cached(
      `followers:${userId}:${page}:${limit}`,
      FOLLOW_TTL,
      () => FollowRepo.getFollowers(userId, page, limit),
    );
    return {
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async getFollowing(
    viewerId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    await this.assertListVisible(viewerId, userId);
    const { rows, total } = await followCache.cached(
      `following:${userId}:${page}:${limit}`,
      FOLLOW_TTL,
      () => FollowRepo.getFollowing(userId, page, limit),
    );
    return {
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async getCounts(viewerId: string, userId: string) {
    await this.assertListVisible(viewerId, userId);
    return followCache.cached(`counts:${userId}`, FOLLOW_TTL, () =>
      FollowRepo.getCounts(userId),
    );
  }

  // A private account's followers/following are visible only to its owner
  // and its accepted followers — the standard "private account" meaning.
  private static async assertListVisible(viewerId: string, userId: string) {
    if (viewerId === userId) return;

    const target = await FollowRepo.getUserBasic(userId);
    if (!target) {
      throw new Error("User not found");
    }
    if (!target.isPrivate) return;

    const isFollower = await FollowRepo.isAcceptedFollower(viewerId, userId);
    if (!isFollower) {
      const err = new Error("This account is private.");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }
  }

  static async getStatus(followerId: string, followingId: string) {
    return followCache.cached(
      `status:${followerId}:${followingId}`,
      FOLLOW_TTL,
      () => FollowRepo.checkStatus(followerId, followingId),
    );
  }

  static async getSuggestions(userId: string, page: number, limit: number) {
    // The most expensive read here - it walks the follow graph - and the one
    // nobody is watching for their own write to appear in.
    return followCache.cached(
      `suggestions:${userId}:${page}:${limit}`,
      FOLLOW_TTL,
      () => FollowRepo.getSuggestions(userId, page, limit),
    );
  }
}
