/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { status_rating, TRating } from "../models/rating.model";
import RatingRepo from "../repositories/rating.repository";

export default class RatingSvc {
  static async getRatings(query: any, limit: number, skip: number) {
    try {
      const list_count = await RatingRepo.countRatings(query);
      const lists = await RatingRepo.getRatings(query, limit, skip);
      return {
        total: list_count,
        data: lists,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getOverAllRating(space_id: string) {
    try {
      return await RatingRepo.getOverallRatings({ space: new ObjectId(space_id), status: status_rating.APPROVED });
    } catch (error) {
      throw error;
    }
  }

  static async getRating(query: any) {
    try {
      return await RatingRepo.getOverallRatings(query);
    } catch (error) {
      throw error;
    }
  }

  static async upsertRating(query: any, data: TRating) {
    try {
      return await RatingRepo.upsertRating(query, data);
    } catch (error) {
      throw error;
    }
  }

  static async updateRating(query: any, data: any) {
    try {
      return await RatingRepo.updateRating(query, data);
    } catch (error) {
      throw error;
    }
  }
}
