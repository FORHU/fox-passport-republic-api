import { Filter } from "mongodb";

import { TSpace } from "../../models/space.model";
import { getDB } from "../../utils/mongo";
import { createMatchStages, createPaginationStages } from "../../utils/pipelines/common.pipelines";
import {
  CAPACITY_LAYOUT_LOOKUP,
  createSpacesProject,
  FEATURES_LOOKUP,
  FLOOR_PLAN_LOOKUP,
  GET_SPACES_RATING,
  KEYWORDS_LOOKUP,
  SPACE_PHOTO_LOOKUP,
  USER_LOOKUP,
  USER_UNWIND,
  VENUE_LOOKUP,
  VENUE_PHOTO_LOOKUP,
  VENUE_UNWIND,
} from "../../utils/pipelines/space.pipelines";

export default class SpaceRepository {
  static collection() {
    return getDB().collection("spaces");
  }

  static getSpaces(query: any, limit: number, skip: number) {
    const spaceProjectPayload = {
      _id: 1,
      space_details_name: 1,
      space_details_description: 1,
      space_photo: 1,
      status: 1,
      venue: {
        _id: 1,
        name: 1,
        address: 1,
        tenant: 1,
      },
      pricing: 1,
      capacity_layout: 1,
      marked_as_favorite: {
        $cond: {
          if: { $isArray: "$marked_as_favorite" },
          then: {
            _id: { $arrayElemAt: ["$marked_as_favorite._id", 0] },
            isFavorite: { $cond: { if: { $gt: [{ $size: "$marked_as_favorite" }, 0] }, then: true, else: false } },
          },
          else: {
            _id: null,
            isFavorite: false,
          },
        },
      },
      rating: {
        totalRating: { $sum: "$ratings.rating" },
        averageRating: {
          $cond: {
            if: { $eq: [{ $size: "$ratings" }, 0] },
            then: 0,
            else: { $avg: "$ratings.rating" },
          },
        },
        totalReviews: { $size: "$ratings" },
      },
      total_views: "$totalViews",
    };

    return this.collection()
      .aggregate([
        USER_LOOKUP,
        USER_UNWIND,
        VENUE_LOOKUP,
        VENUE_UNWIND,
        KEYWORDS_LOOKUP,
        SPACE_PHOTO_LOOKUP,
        VENUE_PHOTO_LOOKUP,
        CAPACITY_LAYOUT_LOOKUP,
        FEATURES_LOOKUP,
        FLOOR_PLAN_LOOKUP,
        GET_SPACES_RATING,
        ...createSpacesProject(spaceProjectPayload),
        ...createMatchStages(query),
        ...createPaginationStages(skip, limit),
      ])
      .toArray();
  }

  static getSpace(query: Filter<TSpace>) {
    return this.collection().findOne(query);
  }
}
