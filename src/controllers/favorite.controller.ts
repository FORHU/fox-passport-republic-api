import { Request, Response } from "express";
import FavoriteSvc from "../services/favorite.service";

export default class FavoriteCtrl {
    static async toggleFavorite(req: Request, res: Response) {
        try {
            const { targetId, type } = req.body; // type: 'venue' or 'event'
            const result = await FavoriteSvc.toggleFavorite(req.user!.id, targetId, type);
            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async getUserFavorites(req: Request, res: Response) {
        try {
            const favorites = await FavoriteSvc.getUserFavorites(req.user!.id);
            return res.status(200).json({ success: true, data: favorites });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async checkFavorite(req: Request, res: Response) {
        try {
            const { targetId, type } = req.query as any;
            const isFavorite = await FavoriteSvc.checkFavorite(req.user!.id, targetId, type);
            return res.status(200).json({ success: true, data: { isFavorite } });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async addFavorite(req: Request, res: Response) {
        try {
            const { targetId, type } = req.body;
            const result = await FavoriteSvc.addFavorite(req.user!.id, targetId, type);
            return res.status(201).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async removeFavorite(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await FavoriteSvc.removeFavorite(id);
            return res.status(200).json({ success: true, message: "Favorite removed successfully" });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async removeFavoriteByListing(req: Request, res: Response) {
        try {
            const { targetId, type } = req.body;
            await FavoriteSvc.removeFavoriteByListing(req.user!.id, targetId, type);
            return res.status(200).json({ success: true, message: "Favorite removed successfully" });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
