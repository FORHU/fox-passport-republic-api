import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import RatingSvc from "../services/rating.service";
import { validateCreateRatingSchema } from "../utils/rating/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class RatingCtrl {
  static async getOverAllRating(req: Request, res: Response) {
    try {
      const space_id = req.params.space_id as string;

      const result = await RatingSvc.getOverAllRating(space_id);
      handleResponse(res, result, "FETCH_OVERALL_SPACE_RATING");
    } catch (error) {
      handleErrorResponse(res, error, { code: "RATING_CREATION_FAILED" });
    }
  }

  static async getRating(req: Request, res: Response) {
    try {
      const userId = req?.user?._id as string;
      const spaceId = req.params.space_id as string;

      // Create ObjectId instances
      const space = new ObjectId(spaceId);
      const user = new ObjectId(userId);
      const result = await RatingSvc.getRating({ space, user });
      handleResponse(res, result, "FETCH_SPACE_RATING");
    } catch (error) {
      handleErrorResponse(res, error, { code: "RATING_CREATION_FAILED" });
    }
  }

  static async createRating(req: Request, res: Response) {
    try {
      const { rating, publicNote, privateNote } = req.body;
      const userId = req?.user?._id as string;
      const spaceId = req.params.space_id as string;

      const { error } = validateCreateRatingSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const space = new ObjectId(spaceId);
      const user = new ObjectId(userId);

      const result = await RatingSvc.upsertRating({ user, space }, { user, space, rating, publicNote, privateNote });

      return handleResponse(res, result, "RATING_CREATED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "RATING_CREATION_FAILED" });
    }
  }
}
