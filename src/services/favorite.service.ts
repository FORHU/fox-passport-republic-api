import FavoriteRepo from "../repositories/favorite.repository";

export default class FavoriteSvc {
  static async toggleFavorite(
    userId: string,
    targetId: string,
    type: "venue" | "event",
  ) {
    return FavoriteRepo.toggleFavorite(userId, targetId, type);
  }

  static async getUserFavorites(userId: string) {
    return FavoriteRepo.getUserFavorites(userId);
  }

  static async checkFavorite(
    userId: string,
    targetId: string,
    type: "venue" | "event",
  ) {
    // Implement check logic or call repo if added
    return FavoriteRepo.isFavorite(userId, targetId, type);
  }

  static async addFavorite(
    userId: string,
    targetId: string,
    type: "venue" | "event",
  ) {
    // Explicitly add if not exists
    return FavoriteRepo.toggleFavorite(userId, targetId, type); // For now reuse toggle as it handles existence
  }

  static async removeFavorite(id: string) {
    return FavoriteRepo.removeFavorite(id);
  }

  static async removeFavoriteByListing(
    userId: string,
    targetId: string,
    type: "venue" | "event",
  ) {
    return FavoriteRepo.removeFavoriteByListing(userId, targetId, type);
  }
}
