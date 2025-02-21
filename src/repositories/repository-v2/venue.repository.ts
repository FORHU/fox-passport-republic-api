import { ObjectId } from "mongodb";
import { MVenue, TVenue } from "../../models/venue.models";
import { getDB } from "../../utils/mongo";
import RedisUtil from "../../utils/redis.util";

const VENUE_PREFIX = "venues";
const SPACE_PREFIX = "spaces";

export default class VenueRepo {
  static collection() {
    return getDB().collection("venues");
  }

  static async createVenue(data: TVenue) {
    await RedisUtil.invalidateByPrefix(VENUE_PREFIX);
    await RedisUtil.invalidateByPrefix(SPACE_PREFIX);

    return this.collection().insertOne(new MVenue(data));
  }

  static async getVenueNames(query: any) {
    try {
      const result = await this.collection().findOne(query);

      if (result) {
        return "Name is invalid";
      } else {
        return "Name is valid";
      }
    } catch (error) {
      console.error("Error while fetching venue:", error);
      throw new Error("Failed to fetch venue");
    }
  }

  static async getPaginatedVenues(query: any, skip: number, limit: number, project?: Record<string, number>) {
    const pipeline = [];

    const fileProject = {
      filename: 1,
      path: 1,
      createdAt: 1,
    };

    pipeline.push(
      {
        $match: query,
      },
      {
        $project: {
          _id: 1,
          user: 1,
          name: 1,
          representation: 1,
          description: 1,
          keywords: 1,
          cancellation_policy: 1,
          foods_and_beverages: 1,
          venue_details: 1,
          address: 1,
          status: 1,
          organization: 1,
          age_restriction: 1,
          commission: 1,
          rebate: 1,
          payment_method: 1,
          createdAt: 1,
          updatedAt: 1,
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
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "keywords",
          localField: "keywords",
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
          as: "keywords",
        },
      },
      {
        $lookup: {
          from: "cancellation-policies",
          localField: "cancellation_policy",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                venue_id: 0,
              },
            },
          ],
          as: "cancellation_policy",
        },
      },
      {
        $unwind: {
          path: "$cancellation_policy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "questions",
          localField: "foods_and_beverages",
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
          as: "foods_and_beverages",
        },
      },
      {
        $lookup: {
          from: "questions",
          localField: "venue_details",
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
          as: "venue_details",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "_id",
          foreignField: "venue",
          pipeline: [
            {
              $project: {
                venue: 0,
                user: 0,
                keywords: 0,
                features: 0,
                floor_plan: 0,
                capacity_layout: 0,
                createdAt: 0,
                updatedAt: 0,
                deletedAt: 0,
                deletedBy: 0,
              },
            },
          ],
          as: "spaces",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "spaces.venue_photo",
          foreignField: "_id",
          pipeline: [
            {
              $project: fileProject,
            },
          ],
          as: "venue_photos",
        },
      },
      {
        $sort: {
          "venue_photos.createdAt": 1,
        },
      },
      { $unset: "spaces.venue_photo" },
      {
        $lookup: {
          from: "files",
          localField: "spaces.space_photo",
          foreignField: "_id",
          pipeline: [
            {
              $project: fileProject,
            },
          ],
          as: "space_photos",
        },
      },
      {
        $sort: {
          "space_photos.createdAt": 1,
        },
      },
      { $unset: "spaces.space_photo" },
      {
        $addFields: {
          latestDate: {
            $max: ["$updatedAt", "$createdAt"],
          },
        },
      },
      { $sort: { latestDate: -1 } },
      { $unset: "createdAt" },
      { $unset: "updatedAt" },
    );

    if (project) {
      pipeline.push({ $project: project });
    }

    pipeline.push({ $skip: skip }, { $limit: limit });
    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async countVenues(query: any) {
    const pipeline = [
      {
        $lookup: {
          from: "keywords",
          localField: "keywords",
          foreignField: "_id",
          as: "matched_keywords",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "_id",
          foreignField: "venue",
          as: "spaces",
        },
      },
      ...(Object.keys(query).length > 0 ? [{ $match: query }] : []),
      { $count: "total_count" },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();

    if (result.length > 0 && result[0].total_count !== undefined) {
      return result[0].total_count;
    } else {
      return 0;
    }
  }
}
