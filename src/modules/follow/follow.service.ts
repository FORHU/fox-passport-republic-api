import FollowRepo from "./follow.repository";

export default class FollowService {
  static async toggleFollow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new Error("You cannot follow yourself");
    }

    return FollowRepo.toggle(followerId, followingId);
  }

  static async getFollowers(userId: string, page: number, limit: number) {
    const { rows, total } = await FollowRepo.getFollowers(userId, page, limit);
    return {
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async getFollowing(userId: string, page: number, limit: number) {
    const { rows, total } = await FollowRepo.getFollowing(userId, page, limit);
    return {
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async getStatus(followerId: string, followingId: string) {
    const isFollowing = await FollowRepo.checkStatus(followerId, followingId);
    return { following: isFollowing };
  }

  static async getCounts(userId: string) {
    return FollowRepo.getCounts(userId);
  }

  static async getSuggestions(userId: string) {
    return FollowRepo.getSuggestions(userId);
  }
}
