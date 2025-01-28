/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { TFavorite, TUpdateFavorite } from "../models/favorite.model";
import FavoriteRepo from "../repositories/favorite.repository";
import { PaginationType } from "../types/common";
import FavoriteFolderSvc from "./favorite-folder.service";
import UserLogsSvc from "./user-logs.service";

export default class FavoriteSvc {
  static async getMarkedAsFavorite(query: Partial<TFavorite>) {
    try {
      const favorites = await FavoriteRepo.getMarkedAsFavorites(query);
      return favorites;
    } catch (error) {
      throw error;
    }
  }

  static async createFavorite(payload: any, userId: ObjectId) {
    try {
      const { space_id, folder_name = "", favorite_folder_id = null } = payload;

      const favFolderId = new ObjectId();
      if (!favorite_folder_id && folder_name) {
        await FavoriteFolderSvc.createFavoriteFolder({
          _id: favFolderId,
          user: userId,
          folder_name,
          createdAt: new Date(),
        });
      }

      const data = {
        space: new ObjectId(space_id as string),
        user: userId,
        marked_as_favorite: true,
        createdAt: new Date(),
        favorite_folder: favorite_folder_id ? new ObjectId(favorite_folder_id as string) : favFolderId,
      };
      const insertedId = await FavoriteRepo.createFavorite(data);
      return insertedId;
    } catch (error) {
      throw error;
    }
  }

  static async groupFavorite(params: any, userId: ObjectId) {
    const { favorite_folder, space_id, page, limit } = params as any;

    const query: any = {
      user: userId,
      ...params,
    };

    if (favorite_folder) {
      query.favorite_folder = new ObjectId(favorite_folder);
    }
    if (space_id) {
      query.space_id = new ObjectId(space_id);
    }

    const pageNumber = page ? parseInt(page.toString()) : 0;
    const limitNumber = limit ? parseInt(limit.toString()) : 10;

    const pagination: PaginationType = {
      query,
      skip: pageNumber,
      limit: limitNumber,
    };

    const results = await FavoriteSvc.groupByFavoriteFolder(pagination);
    let finalResult = results;

    const folders = await FavoriteFolderSvc.getFavoriteFolder({ user: userId });

    folders.forEach((folder) => {
      const isFolderExist = results.find((val) => val._id.favorite_folder.toString() === folder._id.toString());
      if (!isFolderExist) {
        finalResult.push({
          _id: {
            favorite_folder: folder._id,
            folder_name: folder.folder_name,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
          },
        });
      }
    });

    finalResult.sort((a, b) => new Date(b._id.createdAt).getTime() - new Date(a._id.createdAt).getTime());

    if (!favorite_folder && !space_id) {
      const userViewLogs = await UserLogsSvc.getUserLogs({ action: "VIEW_SPACE", user: userId });
      const viewLogsPhotos: any[] = [];
      userViewLogs.forEach((item: any) => {
        if (item.spaces.length > 0) {
          item.spaces.forEach((space: any) => {
            if (viewLogsPhotos.length < 4 && space.space_photo.length !== 0) {
              viewLogsPhotos.push(space.space_photo[0]);
            }
          });
        }
      });
      const recentlyViewed = {
        _id: {
          folder_name: "Recently Viewed",
          recentViewDate: userViewLogs.length > 0 ? userViewLogs[0].date : "",
          cover_photo: viewLogsPhotos,
        },
      };
      finalResult = [recentlyViewed, ...finalResult];
    }
    return finalResult;
  }

  static async updateMarkedAsFavorite(data: TUpdateFavorite, id: ObjectId) {
    try {
      const result = await FavoriteRepo.updateMarkedAsFavorite(data, id);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async updateFavorite(data: TUpdateFavorite, id: string) {
    try {
      const result = await FavoriteRepo.updateFavorite(data, id);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async groupByFavoriteFolder(pagination: PaginationType) {
    return await FavoriteRepo.groupByFavoriteFolder(pagination);
  }
  static async getFavorites(pagination: PaginationType) {
    return await FavoriteRepo.getFavorites(pagination);
  }
  static async getFolders() {
    return await FavoriteRepo.getFolders();
  }
  static async deleteFavorite(query: any) {
    return await FavoriteRepo.deleteFavorite(query);
  }
}
