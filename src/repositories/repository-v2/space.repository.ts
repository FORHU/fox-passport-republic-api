import { Filter, ObjectId } from "mongodb";

import { TSpace } from "../../models/space.model";
import { getDB } from "../../utils/mongo";
import { createMatchStages, createPaginationStages } from "../../utils/pipelines/common.pipelines";
import {
  BOOKING_LOOKUP,
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

  static async getSpaces(query: any, limit: number, skip: number, userId?: string) {
    const user_id = userId ? new ObjectId(userId) : null;

    const filterQuery = {
      ...query,
      deletedAt: null,
    };

    const pipeline = [
      {
        $match: filterQuery,
      },
      {
        $project: {
          _id: 1,
          venue: 1,
          user: 1,
          status: 1,
          name: 1,
          type: 1,
          representation: 1,
          description: 1,
          space_photo: 1,
          venue_photo: 1,
          capacity_layout: 1,
          guest_capacity: 1,
          floor_plan: 1,
          features: 1,
          keywords: 1,
          pricing: 1,
        },
      },
      { $sort: { _id: -1 } },
      {
        $lookup: {
          from: "venues",
          localField: "venue",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                representation: 1,
                description: 1,
                address: 1,
                cancellation_policy: 1,
                keywords: 1,
                status: 1,
                age_restriction: 1,
                venue_details: 1,
              },
            },
          ],
          as: "venue",
        },
      },
      {
        $set: {
          venue: {
            $ifNull: [
              {
                $first: "$venue",
              },
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "cancellation-policies",
          localField: "venue.cancellation_policy",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                venue_id: 0,
                updatedAt: 0,
                createdAt: 0,
              },
            },
          ],
          as: "venue.cancellation_policy",
        },
      },
      {
        $set: {
          "venue.cancellation_policy": {
            $ifNull: [
              {
                $first: "$venue.cancellation_policy",
              },
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "keywords",
          localField: "venue.keywords",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                keyword: 1,
                categories: {
                  $arrayElemAt: ["$categories", 0],
                },
              },
            },
          ],
          as: "venue.keywords",
        },
      },
      {
        $lookup: {
          from: "questions",
          localField: "venue.venue_details",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                question: 1,
                reference: 1,
                answer: 1,
                options: 1,
              },
            },
          ],
          as: "venue.venue_details",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                first_name: 1,
                last_name: 1,
                phone_number: 1,
                email: 1,
                date_of_birth: 1,
                country: 1,
                organization: 1,
                social_link: 1,
                company_name: 1,
                role: 1,
              },
            },
          ],
          as: "user",
        },
      },
      {
        $set: {
          user: {
            $ifNull: [{ $first: "$user" }, null],
          },
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "venue_photo",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                filename: 1,
                path: 1,
                createdAt: 1,
              },
            },
          ],
          as: "venue_photos",
        },
      },
      {
        $sort: {
          "venue_photos.createdAt": -1,
        },
      },
      { $unset: "venue_photo" },
      {
        $lookup: {
          from: "files",
          localField: "space_photo",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                filename: 1,
                path: 1,
                createdAt: 1,
              },
            },
          ],
          as: "space_photos",
        },
      },
      {
        $sort: {
          "space_photos.createdAt": -1,
        },
      },
      { $unset: "space_photo" },
      // {
      //   $lookup: {
      //     from: "questions",
      //     localField: "capacity_layout",
      //     foreignField: "_id",
      //     pipeline: [
      //       {
      //         $project: {
      //           question: 1,
      //           reference: 1,
      //           answer: 1,
      //           options: 1,
      //         },
      //       },
      //     ],
      //     as: "capacity_layout",
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "files",
      //     localField: "floor_plan",
      //     foreignField: "_id",
      //     pipeline: [
      //       {
      //         $project: {
      //           filename: 1,
      //           path: 1,
      //           createdAt: 1,
      //         },
      //       },
      //     ],
      //     as: "floor_plan",
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "questions",
      //     localField: "features",
      //     foreignField: "_id",
      //     pipeline: [
      //       {
      //         $project: {
      //           question: 1,
      //           reference: 1,
      //           answer: 1,
      //           options: 1,
      //         },
      //       },
      //     ],
      //     as: "features",
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "keywords",
      //     localField: "keywords",
      //     foreignField: "_id",
      //     pipeline: [
      //       {
      //         $project: {
      //           keyword: 1,
      //           categories: {
      //             $arrayElemAt: ["$categories", 0],
      //           },
      //         },
      //       },
      //     ],
      //     as: "keywords",
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "pricing",
      //     localField: "pricing",
      //     foreignField: "_id",
      //     pipeline: [
      //       {
      //         $project: {
      //           space_id: 0,
      //           updatedAt: 0,
      //         },
      //       },
      //     ],
      //     as: "pricing",
      //   },
      // },
      // {
      //   $set: {
      //     pricing: {
      //       $ifNull: [{ $first: "$pricing" }, null],
      //     },
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "favorites",
      //     localField: "_id",
      //     foreignField: "space",
      //     pipeline: [
      //       {
      //         $match: {
      //           user: user_id,
      //         },
      //       },
      //       {
      //         $project: {
      //           marked_as_favorite: 1,
      //           _id: 0,
      //         },
      //       },
      //     ],
      //     as: "marked_as_favorite",
      //   },
      // },
      // {
      //   $set: {
      //     marked_as_favorite: {
      //       $ifNull: [
      //         {
      //           $first: "$marked_as_favorite.marked_as_favorite",
      //         },
      //         false,
      //       ],
      //     },
      //   },
      // },
      // {
      //   $facet: {
      //     metadata: [{ $count: "total_items" }],
      //     data: [{ $skip: skip }, { $limit: limit }],
      //   },
      // },
      // {
      //   $addFields: {
      //     total_items: { $arrayElemAt: ["$metadata.total_items", 0] },
      //     data: "$data",
      //   },
      // },
      // {
      //   $addFields: {
      //     total_items: { $ifNull: ["$total_items", 0] },
      //     total_pages: {
      //       $ceil: {
      //         $divide: ["$total_items", limit],
      //       },
      //     },
      //     current_page: {
      //       $add: [{ $divide: [skip, limit] }, 1],
      //     },
      //     size: limit,
      //     offset: skip,
      //   },
      // },
      // {
      //   $project: {
      //     metadata: 0,
      //   },
      // },
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
