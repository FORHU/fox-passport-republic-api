import { sendFailure, sendServerError } from "../../utils/errors";
import { Request, Response } from "express";
import FavoriteSvc from "./favorite.service";
import {
  FAVORITE_INPUT_ERROR,
  FavoriteType,
  isFavoriteType,
} from "./favorite.constants";

/** `{ targetId, type }` from a body or query, or null when either is invalid. */
function favoriteInput(
  source: unknown,
): { targetId: string; type: FavoriteType } | null {
  const { targetId, type } = (source ?? {}) as {
    targetId?: unknown;
    type?: unknown;
  };
  if (typeof targetId !== "string" || !targetId || !isFavoriteType(type)) {
    return null;
  }
  return { targetId, type };
}

const badInput = (res: Response) =>
  res.status(400).json({ success: false, message: FAVORITE_INPUT_ERROR });

export default class FavoriteCtrl {
  static async toggleFavorite(req: Request, res: Response) {
    const input = favoriteInput(req.body);
    if (!input) return badInput(res);
    try {
      const result = await FavoriteSvc.toggleFavorite(
        req.user!.userId,
        input.targetId,
        input.type,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getUserFavorites(req: Request, res: Response) {
    try {
      const favorites = await FavoriteSvc.getUserFavorites(req.user!.userId);
      return res.status(200).json({ success: true, data: favorites });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  static async checkFavorite(req: Request, res: Response) {
    const input = favoriteInput(req.query);
    if (!input) return badInput(res);
    try {
      const isFavorite = await FavoriteSvc.checkFavorite(
        req.user!.userId,
        input.targetId,
        input.type,
      );
      return res.status(200).json({ success: true, data: { isFavorite } });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  static async addFavorite(req: Request, res: Response) {
    const input = favoriteInput(req.body);
    if (!input) return badInput(res);
    try {
      const result = await FavoriteSvc.addFavorite(
        req.user!.userId,
        input.targetId,
        input.type,
      );
      return res.status(201).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async removeFavorite(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await FavoriteSvc.removeFavorite(id, req.user!.userId);
      return res
        .status(200)
        .json({ success: true, message: "Favorite removed successfully" });
    } catch (e: unknown) {
      return sendFailure(res, e, 400, { success: true });
    }
  }

  static async removeFavoriteByListing(req: Request, res: Response) {
    const input = favoriteInput(req.body);
    if (!input) return badInput(res);
    try {
      await FavoriteSvc.removeFavoriteByListing(
        req.user!.userId,
        input.targetId,
        input.type,
      );
      return res
        .status(200)
        .json({ success: true, message: "Favorite removed successfully" });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
