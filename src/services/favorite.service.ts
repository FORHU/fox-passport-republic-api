import FavoriteRepo from "../repositories/favorite.repository";

export default class FavoriteSvc {
    // GET USER FAVORITES
    static async getUserFavorites(userId: string) {
        return FavoriteRepo.getUserFavorites(userId);
    }

    // ADD TO FAVORITES
    static async addFavorite(data: {
        userId: string;
        eventId: string;
    }) {
        // Check if already favorited
        const alreadyFavorited = await FavoriteRepo.isFavorited(data.userId, data.eventId);
        if (alreadyFavorited) {
            throw new Error("Event is already in favorites");
        }

        return FavoriteRepo.addFavorite(data);
    }

    // REMOVE FROM FAVORITES
    static async removeFavorite(id: string, userId: string) {
        // Check if favorite exists
        const exists = await FavoriteRepo.favoriteExists(id);
        if (!exists) {
            throw new Error("Favorite not found");
        }

        // Check if user owns the favorite
        const isOwner = await FavoriteRepo.isFavoriteOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You can only remove your own favorites");
        }

        return FavoriteRepo.removeFavorite(id);
    }

    // REMOVE FROM FAVORITES by Event ID
    static async removeFavoriteByEvent(userId: string, eventId: string) {
        const favorite = await FavoriteRepo.getFavoriteByUserAndEvent(userId, eventId);
        if (!favorite) {
            throw new Error("Favorite not found");
        }

        return FavoriteRepo.removeFavoriteByUserAndEvent(userId, eventId);
    }

    // CHECK IF FAVORITED
    static async isFavorited(userId: string, eventId: string) {
        return FavoriteRepo.isFavorited(userId, eventId);
    }
}
