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

  // static async getPaginatedVenues(query: any, skip: number, limit: number) {
  //   const pipeline = [];

  //   pipeline.push(
  //     {
  //       $lookup: {
  //         from: "keywords",
  //         localField: "keywords",
  //         foreignField: "_id",
  //         as: "matched_keywords",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "cancellation-policies",
  //         localField: "cancellation_policy",
  //         foreignField: "_id",
  //         as: "cancellation_policy",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "questions",
  //         localField: "foods_and_beverages",
  //         foreignField: "_id",
  //         as: "foods_and_beverages",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "questions",
  //         localField: "venue_details",
  //         foreignField: "_id",
  //         as: "venue_details",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "spaces",
  //         localField: "_id",
  //         foreignField: "venue",
  //         as: "spaces",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "files",
  //         localField: "spaces.venue_photo",
  //         foreignField: "_id",
  //         as: "venue_photos",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "files",
  //         localField: "spaces.space_photo",
  //         foreignField: "_id",
  //         as: "space_photos",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "users",
  //         localField: "user",
  //         foreignField: "_id",
  //         as: "user",
  //       },
  //     },
  //     {
  //       $lookup: {
  //         from: "spaces",
  //         localField: "_id",
  //         foreignField: "venue",
  //         as: "spaces",
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: "$spaces",
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },
  //   );

  //   pipeline.push({
  //     $match: query,
  //   });

  //   pipeline.push(
  //     {
  //       $unwind: {
  //         path: "$venue_photos",
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },
  //     {
  //       $sort: {
  //         "venue_photos.createdAt": 1,
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: "$space_photos",
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },
  //     {
  //       $sort: {
  //         "space_photos.createdAt": 1,
  //       },
  //     },
  //     {
  //       $group: {
  //         _id: "$_id",
  //         venue_photos: { $push: "$venue_photos" },
  //         space_photos: { $push: "$space_photos" },
  //         name: { $first: "$name" },
  //         representation: { $first: "$representation" },
  //         description: { $first: "$description" },
  //         address: { $first: "$address" },
  //         keywords: { $first: "$matched_keywords" },
  //         status: { $first: "$status" },
  //         cancellation_policy: { $first: "$cancellation_policy" },
  //         foods_and_beverages: { $first: "$foods_and_beverages" },
  //         venue_details: { $first: "$venue_details" },
  //         user: { $first: "$user" },
  //         organization: { $first: "$organization" },
  //         age_restriction: { $first: "$age_restriction" },
  //         form_steps: { $first: "$form_steps" },
  //         commission: { $first: "$commission" },
  //         rebate: { $first: "$rebate" },
  //         payment_method: { $first: "$payment_method" },
  //         spaces: { $push: "$spaces" },
  //         createdAt: { $first: "$createdAt" },
  //         updatedAt: { $first: "$updatedAt" },
  //         deletedAt: { $first: "$deletedAt" },
  //         deletedBy: { $first: "$deletedBy" },
  //       },
  //     },
  //   );

  //   pipeline.push({
  //     $project: {
  //       _id: 1,
  //       name: 1,
  //       representation: 1,
  //       description: 1,
  //       address: 1,
  //       form_steps: 1,
  //       keywords: 1,
  //       cancellation_policy: {
  //         $cond: {
  //           if: { $gt: [{ $size: "$cancellation_policy" }, 0] },
  //           then: { $arrayElemAt: ["$cancellation_policy", 0] },
  //           else: null,
  //         },
  //       },
  //       venue_photos: 1,
  //       space_photos: 1,
  //       user: { $arrayElemAt: ["$user", 0] },
  //       foods_and_beverages: 1,
  //       venue_details: 1,
  //       organization: 1,
  //       age_restriction: 1,
  //       commission: 1,
  //       rebate: 1,
  //       createdAt: 1,
  //       updatedAt: 1,
  //       deletedAt: 1,
  //       deletedBy: 1,
  //       status: 1,
  //       payment_method: 1,
  //       spaces: 1,
  //     },
  //   });

  //   pipeline.push({
  //     $addFields: {
  //       latestDate: { $max: ["$updatedAt", "$createdAt"] },
  //     },
  //   });

  //   pipeline.push({ $sort: { latestDate: -1 } });
  //   pipeline.push({ $skip: skip }, { $limit: limit });
  //   const result = await this.collection().aggregate(pipeline).toArray();
  //   return result;
  // }

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

  static async getVenues(query: any, project?: Record<string, number>) {
    const pipeline = [];

    pipeline.push({ $match: query });

    pipeline.push({
      $lookup: {
        from: "keywords",
        localField: "keywords",
        foreignField: "_id",
        as: "keywords",
      },
    });

    if (project) {
      pipeline.push({ $project: project });
    }

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async getVenue(query: any) {
    try {
      const result = await this.collection().findOne(query);
      return result;
    } catch (error) {
      console.error("Error while fetching venue:", error);
      throw new Error("Failed to fetch venue");
    }
  }
}
