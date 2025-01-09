/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { TRating } from "../models/rating.model";
import RatingRepo from "../repositories/rating.repository";

export default class RatingSvc {
  static async getOverAllRating(space_id: string) {
    try {
      return await RatingRepo.getOverallRatings({ space: new ObjectId(space_id) });
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
}
