/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { TRating } from "../models/rating.model";
import RatingRepo from "../repositories/rating.repository";

export default class RatingSvc {
  static async getOverAllRating(space_id: string) {
    try {
      const rating = await RatingRepo.getRatingAverage({ space: new ObjectId(space_id) });
      return rating;
    } catch (error) {
      throw error;
    }
  }

  static async getRating(query: any) {
    try {
      const rating = await RatingRepo.getRating(query);
      return rating;
    } catch (error) {
      throw error;
    }
  }

  static async upsertRating(query: any, data: TRating) {
    try {
      const insertedId = await RatingRepo.upsertRating(query, data);
      return insertedId;
    } catch (error) {
      throw error;
    }
  }
}
