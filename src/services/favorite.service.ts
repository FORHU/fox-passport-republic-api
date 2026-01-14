import FavoriteRepo from "../repositories/favorite.repository";

export default class FavoriteSvc {
    static async toggleFavorite(userId: string, targetId: string, type: 'venue' | 'event') {
        return FavoriteRepo.toggleFavorite(userId, targetId, type);
    }

    static async getUserFavorites(userId: string) {
        return FavoriteRepo.getUserFavorites(userId);
    }
}
