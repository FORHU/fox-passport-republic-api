import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { TFavorite } from "../models/favorite.model";
import FavoriteSvc from "../services/favorite.service";
import FavoriteFolderSvc from "../services/favorite-folder.service";
import SpaceSvc from "../services/space.service";
import UserLogsSvc from "../services/user-logs.service";
import { PaginationType } from "../types/common";
import {
  validateAssignToFavoriteFolderSchema,
  validateCreateFavoriteSchema,
  validateFilterFavoriteSchema,
  validateGetFolder,
  validateRecentlyViewedFilter,
  validateUpdateFavoriteSchema,
  validateUpdateFolderSchema,
} from "../utils/favorites/validation";
import { logger } from "../utils/logger";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import PricingRepo from "../repositories/pricing.repository";
import { PricingData, getSummarizedPricing } from "../utils/helpers";

export default class FavoriteCtrl {
  static async createFavorite(req: Request, res: Response) {
    try {
      const { space_id } = req.body;
      const userId = new ObjectId(req?.user?._id);

      const { error } = validateCreateFavoriteSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      if (!userId) {
        return handleErrorResponse(res, new Error("User not found"), { code: "USER_NOT_FOUND" });
      }
      const isSpaceExist = await SpaceSvc.getSpace({ _id: new ObjectId(space_id) });
      if (!isSpaceExist) {
        return handleErrorResponse(res, new Error("Space not found"), { code: "SPACE_NOT_FOUND" });
      }

      const [existingData]: any = await FavoriteSvc.getMarkedAsFavorite({ space: space_id, user: userId } as TFavorite);
      if (existingData) {
        return handleErrorResponse(res, new Error("Space already marked as favorite"), { code: "SPACE_ALREADY_MARKED_AS_FAVORITE" });
      }
      const result = await FavoriteSvc.createFavorite(req.body, userId);
      return handleResponse(res, result, "ADDED_SPACE_TO_FAVORITE");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ADDING_FAVORITE_FAILED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ADDING_FAVORITE_FAILED" });
    }
  }

  static async getMarkedAsFavorite(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id);
      if (!userId) {
        return handleErrorResponse(res, new Error(), { code: "USER_NOT_FOUND" });
      }
      const result = await FavoriteSvc.getMarkedAsFavorite({ user: userId });
      handleResponse(res, result, "FAVORITES_SUCCESSFULLY_FETCHED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[FETCHED_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "FETCHED_FAILED" });
    }
  }

  static async updateMarkedAsFavorite(req: Request, res: Response) {
    try {
      const _id = new ObjectId(req.params.id);
      const { marked_as_favorite } = req.body;

      const { error } = validateUpdateFavoriteSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const result = await FavoriteSvc.updateMarkedAsFavorite({ marked_as_favorite }, _id);

      return handleResponse(res, result, "FAVORITE_SUCCESSFULLY_UPDATED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[UPDATE_FAILED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "UPDATE_FAILED" });
    }
  }

  static async assignToFavoriteFolder(req: Request, res: Response) {
    try {
      const { favorite_folder_id = null, folder_name = null } = req.body;
      const favorite_id: string = req.params.favorite_id;
      const userId = req?.user?._id ? new ObjectId(req?.user?._id) : null;
      if (!userId) {
        return handleErrorResponse(res, new Error("User not found"), { code: "USER_NOT_FOUND" });
      }

      const { error } = validateAssignToFavoriteFolderSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const favFolderId = favorite_folder_id ? new ObjectId(favorite_folder_id) : new ObjectId();

      if (!favorite_folder_id) {
        await FavoriteFolderSvc.createFavoriteFolder({
          _id: favFolderId,
          folder_name,
          user: userId,
        });
      }

      const result = await FavoriteSvc.updateFavorite({ favorite_folder: favFolderId }, favorite_id);

      return handleResponse(res, result, "FAVORITE_SUCCESSFULLY_UPDATED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[FAVORITE_UPDATE_FAILED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "FAVORITE_UPDATE_FAILED" });
    }
  }

  static async updateFavoriteFolder(req: Request, res: Response) {
    try {
      const { folder_name } = req.body;
      const folder_id = new ObjectId(req.params.id);
      const userId = req?.user?._id ? new ObjectId(req.user._id) : null;
      const { error } = validateUpdateFolderSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      if (!userId) {
        return handleErrorResponse(res, new Error("User not found"), { code: "USER_NOT_FOUND" });
      }
      const [isFolder_exist] = await FavoriteFolderSvc.getFavoriteFolder({ _id: new ObjectId(folder_id) });
      if (!isFolder_exist) {
        return handleErrorResponse(res, new Error("Favorite folder not found"), { code: "FAVORITE_FOLDER_NOT_FOUND" });
      }

      await FavoriteFolderSvc.updateFavoriteFolder({ folder_name }, folder_id);
      handleResponse(
        res,
        {
          _id: folder_id,
          folder_name,
        },
        "FOLDER_SUCCESSFULLY_UPDATED",
      );
    } catch (error) {
      logger.log({
        level: "info",
        message: `[FAVORITE_FOLDER_UPDATE_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "FAVORITE_FOLDER_UPDATE_FAILED" });
    }
  }

  static async groupFavorite(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id);

      const { error } = validateFilterFavoriteSchema(req.params);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const result = await FavoriteSvc.groupFavorite(req.query, userId);
      return res.json({ results: result });
    } catch (error) {
      logger.log({
        level: "info",
        message: `[FETCHED_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "FETCHED_FAILED" });
    }
  }
  static async getFavoritesByFolder(req: Request, res: Response) {
    try {
      const folder_id = new ObjectId(req.params.id);
      const userId = new ObjectId(req?.user?._id);
      const { page, limit } = req.query;

      const pageNumber = page ? parseInt(page.toString()) : 0;
      const limitNumber = limit ? parseInt(limit.toString()) : 10;

      const { error } = validateGetFolder(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      // Pagination setup
      const pagination: PaginationType = {
        query: {
          user: userId,
          favorite_folder: folder_id,
        },
        skip: pageNumber,
        limit: limitNumber,
      };

      const result: any = await FavoriteSvc.getFavorites(pagination);

      const spaceIdList = result.map((favorite: any) => favorite.space && new ObjectId(favorite.space._id)).filter((id: ObjectId | null) => id);

      const priceList = await PricingRepo.getPrices({ space_id: { $in: spaceIdList } });

      const transformedPriceList: PricingData[] = priceList.map((price: any) => ({
        space_id: price.space_id.toString(),
        selected_pricing: price.selected_pricing || null,
        currency: price.currency || "USD",
        hire_fee: price.hire_fee || 0,
        cleaning_fee: price.cleaning_fee || 0,
        custom_price: price.custom_price || 0,
      }));

      const summarizedPricing = await getSummarizedPricing(transformedPriceList);
      const pricingMap = new Map(summarizedPricing.map((item: any) => [item.space_id, item]));

      const updatedList = result.map((favorite: any) => ({
        ...favorite,
        space: favorite.space
          ? {
              ...favorite.space,
              pricing_summary: pricingMap.get(favorite.space._id.toString()) || null,
            }
          : null,
      }));

      handleResponse(
        res,
        {
          data: updatedList,
        },
        "FAVORITES_SUCCESSFULLY_FETCHED",
      );
    } catch (error) {
      logger.log({
        level: "info",
        message: `[FETCHED_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "FETCHED_FAILED" });
    }
  }

  static async deleteFavoriteFolder(req: Request, res: Response) {
    try {
      const folder_id = new ObjectId(req.params.id);
      const userId = new ObjectId(req?.user?._id);
      if (!userId) {
        return handleErrorResponse(res, new Error(), { code: "USER_NOT_FOUND" });
      }

      const favorites = await FavoriteSvc.deleteFavorite({ favorite_folder: folder_id, user: userId });
      const folder = await FavoriteFolderSvc.deleteFavoriteFolder({ _id: folder_id });

      return handleResponse(
        res,
        {
          folder,
          favorites,
        },
        "FOLDER_DELETED",
      );
    } catch (error) {
      logger.log({
        level: "info",
        message: `[DELETE_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "DELETE_FAILED" });
    }
  }

  static async viewLogs(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id);

      const { error } = validateRecentlyViewedFilter(req.params);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const { page, limit } = req.query;
      const query: any = {
        user: userId,
        ...req.query,
      };

      const pageNumber = page ? parseInt(page.toString()) : 0;
      const limitNumber = limit ? parseInt(limit.toString()) : 10;

      const results = await UserLogsSvc.getUserLogs(query, pageNumber, limitNumber);
      return res.json({ results });
    } catch (error) {
      logger.log({
        level: "info",
        message: `[FETCHED_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "FETCHED_FAILED" });
    }
  }
  static async deleteViewLogs(req: Request, res: Response) {
    try {
      const user_log_id = new ObjectId(req.params.id);
      const userId = new ObjectId(req?.user?._id);
      if (!userId) {
        return handleErrorResponse(res, new Error(), { code: "USER_NOT_FOUND" });
      }
      const result = await UserLogsSvc.deleteUserLogs({ _id: user_log_id, user: userId });

      return handleResponse(res, result, "USER_LOG_DELETED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[DELETE_FAILED]: ${JSON.stringify(error)}`,
      });
      handleErrorResponse(res, error, { code: "DELETE_FAILED" });
    }
  }
}
