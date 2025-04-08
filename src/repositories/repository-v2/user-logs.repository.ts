import { Filter } from "mongodb";

import { TUserLogs } from "../../models/user-logs.model";
import { getDB } from "../../utils/mongo";
import { createSpacesProject } from "../../utils/pipelines/space.pipelines";

export default class UserLogsV2Repo {
  static collection() {
    return getDB().collection("user-logs");
  }

  static async handleGetMostPopularSpaces(query: Filter<any>, skip: number, limit: number) {
    const { status, venue, user_id, fully_verified, ...cleanedQuery } = query;

    const pipeline: any[] = [
      {
        $match: cleanedQuery,
      },
      {
        $group: {
          _id: "$details.space",
          totalViews: { $sum: "$count" },
        },
      },
      {
        $sort: { totalViews: -1 },
      },
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "space",
          as: "ratings",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "_id",
          foreignField: "_id",
          as: "spaceDetails",
        },
      },
      {
        $unwind: "$spaceDetails",
      },
      {
        $lookup: {
          from: "files",
          localField: "spaceDetails.space_photo",
          foreignField: "_id",
          as: "space_photo",
        },
      },
      {
        $lookup: {
          from: "pricing",
          localField: "spaceDetails.pricing",
          foreignField: "_id",
          as: "pricing",
        },
      },
      {
        $unwind: "$pricing",
      },
      {
        $lookup: {
          from: "questions",
          localField: "spaceDetails.capacity_layout",
          foreignField: "_id",
          as: "capacity_layout",
        },
      },
    ];

    if (status) {
      pipeline.push({
        $match: {
          "spaceDetails.status": status,
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "venues",
          localField: "spaceDetails.venue",
          foreignField: "_id",
          as: "venueDetails",
        },
      },
      {
        $unwind: "$venueDetails",
      },
    );

    if (venue?.user) {
      pipeline.push({
        $match: {
          "venueDetails.user": venue?.user,
        },
      });
    }

    if (venue?.address?.country) {
      pipeline.push({
        $match: {
          "venueDetails.address.country": venue?.address?.country,
        },
      });
    }

    if (venue?.tenant) {
      pipeline.push({
        $match: {
          "venueDetails.tenant": venue?.tenant,
        },
      });
    }

    pipeline.push({
      $lookup: {
        from: "favorites",
        let: { spaceId: "$spaceDetails._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ["$space", "$$spaceId"] }, { $eq: ["$marked_as_favorite", true] }, { $eq: ["$user", user_id] }],
              },
            },
          },
        ],
        as: "marked_as_favorite",
      },
    });

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "venueDetails.user",
        foreignField: "_id",
        as: "userData",
      },
    });

    pipeline.push({
      $set: {
        userData: { $first: "$userData" },
      },
    });

    const projectPayload = {
      _id: 1,
      space_details_name: "$spaceDetails.name",
      space_details_description: "$spaceDetails.description",
      space_photo: {
        $map: {
          input: "$space_photo",
          as: "photo",
          in: {
            _id: "$$photo._id",
            path: "$$photo.path",
            contentType: "$$photo.contentType",
            filename: "$$photo.filename",
            createdAt: "$$photo.createdAt",
          },
        },
      },
      venue: {
        _id: "$venueDetails._id",
        name: "$venueDetails.name",
        address: "$venueDetails.address",
        user: {
          _id: "$userData._id",
          first_name: "$userData.first_name",
          last_name: "$userData.last_name",
          email: "$userData.email",
          status: "$userData.status",
          fully_verified: "$userData.fully_verified",
        },
      },
      pricing: 1,
      capacity_layout: "$capacity_layout",
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
      status: "$spaceDetails.status",
    };

    if (venue["venue.user.fully_verified"] === "true" || venue["venue.user.fully_verified"] === true) {
      pipeline.push({
        $match: {
          "userData.fully_verified": true,
        },
      });
    }

    pipeline.push(...createSpacesProject(projectPayload));

    pipeline.push(
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    );

    try {
      return this.collection().aggregate(pipeline).toArray();
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  static async countGetMostPopularSpaces(input: Filter<TUserLogs>) {
    const { query } = input;
    const { status, venue, user_id, fully_verified, ...cleanedQuery } = query;

    const pipeline: any[] = [
      {
        $match: cleanedQuery,
      },
      {
        $group: {
          _id: "$details.space",
        },
      },
    ];

    pipeline.push(
      {
        $lookup: {
          from: "spaces",
          localField: "_id",
          foreignField: "_id",
          as: "spaceDetails",
        },
      },
      {
        $unwind: {
          path: "$spaceDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
    );

    if (status) {
      pipeline.push({
        $match: {
          "spaceDetails.status": status,
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "venues",
          localField: "spaceDetails.venue",
          foreignField: "_id",
          as: "venueDetails",
        },
      },
      {
        $unwind: {
          path: "$venueDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
    );

    if (venue?.user) {
      pipeline.push({
        $match: {
          "venueDetails.user": venue?.user,
        },
      });
    }

    if (venue?.address?.country) {
      pipeline.push({
        $match: {
          "venueDetails.address.country": venue?.address?.country,
        },
      });
    }

    if (venue?.tenant) {
      pipeline.push({
        $match: {
          "venueDetails.tenant": venue?.tenant,
        },
      });
    }

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "venueDetails.user",
        foreignField: "_id",
        as: "userData",
      },
    });

    pipeline.push({
      $set: {
        userData: { $first: "$userData" },
      },
    });

    if (venue["venue.user.fully_verified"] === "true" || venue["venue.user.fully_verified"] === true) {
      pipeline.push({
        $match: {
          "userData.fully_verified": true,
        },
      });
    }

    pipeline.push({
      $count: "totalCount",
    });

    const result = await this.collection().aggregate(pipeline).toArray();
    return result[0]?.totalCount || 0;
  }
}
