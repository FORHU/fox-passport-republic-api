import FavoriteRepo from "./favorite.repository";
import {
  FAVORITE_SELF,
  FavoriteType,
  FOXER_NOT_FOUND,
} from "./favorite.constants";

export default class FavoriteSvc {
  static async toggleFavorite(
    userId: string,
    targetId: string,
    type: FavoriteType,
  ) {
    return FavoriteRepo.toggleFavorite(userId, targetId, type);
  }

  static async getUserFavorites(userId: string) {
    return FavoriteRepo.getUserFavorites(userId);
  }

  static async checkFavorite(
    userId: string,
    targetId: string,
    type: FavoriteType,
  ) {
    // Implement check logic or call repo if added
    return FavoriteRepo.isFavorite(userId, targetId, type);
  }

  // Adding twice keeps the one favourite. It used to reuse toggle, so a
  // second add (a double click, or a save replayed after sign-in) removed it.
  static async addFavorite(
    userId: string,
    targetId: string,
    type: FavoriteType,
  ) {
    if (type === "foxer") {
      if (targetId === userId) throw new Error(FAVORITE_SELF);
      // A Foxer is a user; refuse ids that point at nobody.
      if (!(await FavoriteRepo.userExists(targetId))) {
        throw new Error(FOXER_NOT_FOUND);
      }
    }
    return FavoriteRepo.addFavorite(userId, targetId, type);
  }

  static async removeFavorite(id: string) {
    return FavoriteRepo.removeFavorite(id);
  }

  static async removeFavoriteByListing(
    userId: string,
    targetId: string,
    type: FavoriteType,
  ) {
    return FavoriteRepo.removeFavoriteByListing(userId, targetId, type);
  }
}
