import { ObjectId } from "mongodb";
import { TFavoriteFolder, TUpdateFavoriteFolder } from "../models/favorite-folder.model";
import FavoriteFolderRepo from "../repositories/favorite-folder.repository";

export default class FavoriteFolderSvc {
  static async createFavoriteFolder(data: TFavoriteFolder) {
    try {
      const insertedId = await FavoriteFolderRepo.createFavoriteFolder(data);
      return insertedId;
    } catch (error) {
      throw error;
    }
  }

  static async updateFavoriteFolder(data: TUpdateFavoriteFolder, id: ObjectId) {
    try {
      const result = await FavoriteFolderRepo.updateFavoriteFolder(data, id);
      return result;
    } catch (error) {
      throw error;
    }
  }
  static async deleteFavoriteFolder(query: any) {
    try {
      const result = await FavoriteFolderRepo.deleteFavoriteFolder(query);
      return result;
    } catch (error) {
      throw error;
    }
  }
  static async getFavoriteFolder(query: any) {
    try {
      const result = await FavoriteFolderRepo.getFavoriteFolder(query);
      return result;
    } catch (error) {
      throw error;
    }
  }
}
