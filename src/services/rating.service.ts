/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { status_rating, TRating } from "../models/rating.model";
import RatingRepo from "../repositories/rating.repository";

export default class RatingSvc {
  static async getRatings(query: any, limit: number, skip: number) {
    try {
      const { search, status, sort = "desc", rating } = query;
      let sortQuery: { createdAt?: number } = {};
      if (sort === "asc") {
        sortQuery = { createdAt: 1 };
      } else if (sort === "desc") {
        sortQuery = { createdAt: -1 };
      }
      const generatedQuery = {};
      if (search) {
        generatedQuery["space.name"] = { $regex: search, $options: "i" };
      }

      if (status) {
        generatedQuery["status"] = status;
      }

      if (rating) {
        generatedQuery["rating"] = Number(rating);
      }

      const list_count = await RatingRepo.countRatings(generatedQuery);
      const lists = await RatingRepo.getRatings(generatedQuery, limit, skip, sortQuery);
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
