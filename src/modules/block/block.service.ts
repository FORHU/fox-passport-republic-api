import BlockRepo from "./block.repository";
import { hasActiveBookingBetween } from "../booking/booking-relationship.util";

export default class BlockService {
  static async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new Error("You cannot block yourself");
    }

    const existing = await BlockRepo.findRow(blockerId, blockedId);
    if (existing) {
      return { blocked: true };
    }

    const hasActiveBooking = await hasActiveBookingBetween(
      blockerId,
      blockedId,
    );
    if (hasActiveBooking) {
      const err = new Error(
        "You can't block this citizen while you have an active booking together. Try again once it's finished or cancelled.",
      );
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    await BlockRepo.create(blockerId, blockedId);
    return { blocked: true };
  }

  static async unblockUser(blockerId: string, blockedId: string) {
    await BlockRepo.delete(blockerId, blockedId);
    return { blocked: false };
  }

  static async getStatus(userId: string, otherId: string) {
    return BlockRepo.getStatus(userId, otherId);
  }

  static async getBlockedUsers(userId: string, page: number, limit: number) {
    const { rows, total } = await BlockRepo.getBlockedUsers(
      userId,
      page,
      limit,
    );
    return {
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
