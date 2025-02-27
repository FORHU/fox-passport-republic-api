import { Filter, ObjectId } from "mongodb";

import { TSpace } from "../../models/space.model";
import { getDB } from "../../utils/mongo";
import { createMatchStages, createPaginationStages } from "../../utils/pipelines/common.pipelines";
import {
  BOOKING_LOOKUP,
  CANCELLATION_LOOKUP,
  CANCELLATION_POLICY_SET,
  CAPACITY_LAYOUT_LOOKUP,
  createSpacesProject,
  FAVORITE_LOOKUP,
  FAVORITE_SET,
  FEATURES_LOOKUP,
  FINAL_PROJECTION,
  FLOOR_PLAN_LOOKUP,
  GET_SPACES_RATING,
  INITIAL_SORT,
  INITIAL_SPACE_PROJECTION,
  KEYWORDS_LOOKUP,
  PRICING_LOOKUP,
  PRICING_SET,
  SPACE_PHOTO_LOOKUP_AS_SPACE_PHOTOS,
  SPACE_PHOTO_UNSET,
  SPACE_PHOTOS_SORT,
  USER_LOOKUP,
  USER_SET,
  VENUE_DETAILS_LOOKUP,
  VENUE_KEYWORDS_LOOKUP,
  VENUE_LOOKUP,
  VENUE_PHOTO_LOOKUP_AS_VENUE_PHOTOS,
  VENUE_PHOTO_UNSET,
  VENUE_PHOTOS_SORT,
  VENUE_SET,
} from "../../utils/pipelines/space.pipelines";
import { ProjectFields } from "../../utils/projection/project";

export default class SpaceRepository {
  static collection() {
    return getDB().collection("spaces");
  }

  static async getSpaces(query: any, limit: number, skip: number, userId?: string, projects?: ProjectFields) {
    const user_id = userId ? new ObjectId(userId) : null;

    const filterQuery = {
      ...query,
      deletedAt: null,
    };

    const pipeline = [
      {
        $match: filterQuery,
      },
      INITIAL_SPACE_PROJECTION,
      INITIAL_SORT,
      VENUE_LOOKUP(projects?.venueProject),
      VENUE_SET,
      CANCELLATION_LOOKUP(projects?.cancellationPolicyProject),
      CANCELLATION_POLICY_SET,
      VENUE_KEYWORDS_LOOKUP(projects?.venueKeywordsProject),
      VENUE_DETAILS_LOOKUP(projects?.venueDetailsProject),
      USER_LOOKUP(projects?.userProject),
      USER_SET,
      VENUE_PHOTO_LOOKUP_AS_VENUE_PHOTOS(projects?.venuePhotosProject),
      VENUE_PHOTOS_SORT,
      VENUE_PHOTO_UNSET,
      VENUE_PHOTO_UNSET,
      SPACE_PHOTO_LOOKUP_AS_SPACE_PHOTOS(projects?.spacePhotosProject),
      SPACE_PHOTOS_SORT,
      SPACE_PHOTO_UNSET,
      CAPACITY_LAYOUT_LOOKUP(projects?.capacityLayoutProject),
      FLOOR_PLAN_LOOKUP(projects?.floorPlanProject),
      FEATURES_LOOKUP(projects?.featuresProject),
      KEYWORDS_LOOKUP(projects?.keywordsProject),
      PRICING_LOOKUP(projects?.pricingProject),
      PRICING_SET,
      FAVORITE_LOOKUP(user_id),
      FAVORITE_SET,
      BOOKING_LOOKUP(projects?.bookingProject),
      FINAL_PROJECTION(projects?.finalProject),
      {
        $facet: {
          metadata: [{ $count: "total_items" }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
      {
        $addFields: {
          total_items: { $arrayElemAt: ["$metadata.total_items", 0] },
          data: "$data",
        },
      },
      {
        $addFields: {
          total_items: { $ifNull: ["$total_items", 0] },
          total_pages: {
            $ceil: {
              $divide: ["$total_items", limit],
            },
          },
          current_page: {
            $add: [{ $divide: [skip, limit] }, 1],
          },
          size: limit,
          offset: skip,
        },
      },
      {
        $project: {
          metadata: 0,
        },
      },
    ];

    const [result] = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static getSpace(query: Filter<TSpace>) {
    return this.collection().findOne(query);
  }

  static async getSpaceWithoutUserLogs(limit: number, offset: number) {
    const pipeline = [
      {
        $lookup: {
          from: "user-logs",
          localField: "_id",
          foreignField: "details.space",
          as: "logs",
        },
      },
      {
        $match: {
          logs: { $size: 0 },
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
      {
        $skip: offset,
      },
      {
        $limit: limit,
      },
    ];
    return this.collection().aggregate(pipeline).toArray();
  }

  static async getTotalSpacesWithoutLogs() {
    const pipeline = [
      {
        $lookup: {
          from: "user-logs",
          localField: "_id",
          foreignField: "details.space",
          as: "logs",
        },
      },
      {
        $match: {
          $expr: { $eq: [{ $size: "$logs" }, 0] }, // Ensures logs array is empty
        },
      },
      {
        $count: "totalCount",
      },
    ];
    const total = await this.collection().aggregate(pipeline).toArray();
    return total[0]?.totalCount || 0;
  }
}
// static async getSpaces(query: any, limit: number, skip: number) {
//   const spaceProjectPayload = {
//     _id: 1,
//     user: 1,
//     name: 1,
//     type: 1,
//     representation: 1,
//     description: 1,
//     space_photo: 1,
//     status: 1,
//     venue: {
//       _id: 1,
//       name: 1,
//       address: 1,
//       tenant: 1,
//     },
//     pricing: 1,
//     capacity_layout: 1,
//     marked_as_favorite: {
//       $cond: {
//         if: { $isArray: "$marked_as_favorite" },
//         then: {
//           _id: { $arrayElemAt: ["$marked_as_favorite._id", 0] },
//           isFavorite: { $cond: { if: { $gt: [{ $size: "$marked_as_favorite" }, 0] }, then: true, else: false } },
//         },
//         else: {
//           _id: null,
//           isFavorite: false,
//         },
//       },
//     },
//     rating: {
//       totalRating: { $sum: "$ratings.rating" },
//       averageRating: {
//         $cond: {
//           if: { $eq: [{ $size: "$ratings" }, 0] },
//           then: 0,
//           else: { $avg: "$ratings.rating" },
//         },
//       },
//       totalReviews: { $size: "$ratings" },
//     },
//     total_views: "$totalViews",
//     keywords: {
//       _id: 1,
//       keyword: 1,
//       categories: 1,
//     },
//     bookings: 1,
//   };

//   const pipeline = [
//     USER_LOOKUP,
//     USER_UNWIND,
//     VENUE_LOOKUP,
//     VENUE_UNWIND,
//     KEYWORDS_LOOKUP,
//     SPACE_PHOTO_LOOKUP,
//     VENUE_PHOTO_LOOKUP,
//     CAPACITY_LAYOUT_LOOKUP,
//     FEATURES_LOOKUP,
//     FLOOR_PLAN_LOOKUP,
//     GET_SPACES_RATING,
//     BOOKING_LOOKUP,
//     ...createMatchStages(query),
//     ...createSpacesProject(spaceProjectPayload),
//     ...createPaginationStages(skip, limit),
//   ];

//   const [result] = await this.collection().aggregate(pipeline).toArray();

//   return result;
// }
