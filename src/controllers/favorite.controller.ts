import { Request, Response } from "express";
import Joi from "joi";
import FavoriteSvc from "../services/favorite.service";

export default class FavoriteController {
    // GET USER FAVORITES
    static async getUserFavorites(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const favorites = await FavoriteSvc.getUserFavorites(value.userId);
            return res.status(200).json({
                success: true,
                count: favorites.length,
                data: favorites,
            });
        } catch (error: any) {
            console.error("Get user favorites error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch favorites",
            });
        }
    }

    // ADD TO FAVORITES
    static async addFavorite(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
                eventId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const favorite = await FavoriteSvc.addFavorite(value);
            return res.status(201).json({
                success: true,
                message: "Event added to favorites",
                data: favorite,
            });
        } catch (error: any) {
            console.error("Add favorite error:", error);
            if (error.message.includes("already in favorites")) {
                return res.status(409).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to add favorite",
            });
        }
    }

    // REMOVE FROM FAVORITES
    static async removeFavorite(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            await FavoriteSvc.removeFavorite(params.id, body.userId);

            return res.status(200).json({
                success: true,
                message: "Event removed from favorites",
            });
        } catch (error: any) {
            console.error("Remove favorite error:", error);
            if (error.message === "Favorite not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to remove favorite",
            });
        }
    }

    // REMOVE FROM FAVORITES by Event ID
    static async removeFavoriteByEvent(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
                eventId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            await FavoriteSvc.removeFavoriteByEvent(value.userId, value.eventId);

            return res.status(200).json({
                success: true,
                message: "Event removed from favorites",
            });
        } catch (error: any) {
            console.error("Remove favorite by event error:", error);
            if (error.message === "Favorite not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to remove favorite",
            });
        }
    }

    // CHECK IF FAVORITED
    static async checkFavorite(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
                eventId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const isFavorited = await FavoriteSvc.isFavorited(value.userId, value.eventId);
            return res.status(200).json({
                success: true,
                data: { isFavorited },
            });
        } catch (error: any) {
            console.error("Check favorite error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to check favorite status",
            });
        }
    }
}
