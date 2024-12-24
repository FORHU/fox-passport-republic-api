import { MUserLogs, TUserLogs } from "../models/user-logs.model";
import { getDB } from "../utils/mongo";

export default class TodoRepo {
  static collection() {
    return getDB().collection("user-logs");
  }

  static async createUserLogs(logs: TUserLogs) {
    return this.collection().insertOne(new MUserLogs(logs));
  }

  static async getUser(query: Partial<TUserLogs>) {
    return this.collection().findOne(query);
  }
  static async deleteUserLog(query: any) {
    return this.collection().deleteOne(query);
  }

  static async getUserLogs(query: any, skip = 0, limit = 10) {
    const { end_date, start_date, action, user } = query as any;

    const collection = this.collection();

    const dateFilter = {
      ...(start_date && { $gt: new Date(start_date) }),
      ...(end_date && { $lt: new Date(end_date) }),
    };

    const matchStage = {
      user,
      ...(action && { action }),
      ...(start_date || end_date ? { updatedAt: dateFilter } : {}),
    };
    const aggregationPipeline = [
      {
        $match: matchStage,
      },
      {
        $sort: { updatedAt: -1 },
      },

      {
        $lookup: {
          from: "venues",
          localField: "details.venue",
          foreignField: "_id",
          as: "venueDetails",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "details.space",
          foreignField: "_id",
          as: "spaceDetails",
        },
      },
      {
        $addFields: {
          venue: {
            $cond: {
              if: { $and: [{ $eq: ["$action", "VIEW_VENUE"] }, { $gt: [{ $size: "$venueDetails" }, 0] }] },
              then: { $arrayElemAt: ["$venueDetails", 0] },
              else: null,
            },
          },
          space: {
            $cond: {
              if: { $and: [{ $eq: ["$action", "VIEW_SPACE"] }, { $gt: [{ $size: "$spaceDetails" }, 0] }] },
              then: { $arrayElemAt: ["$spaceDetails", 0] },
              else: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "space.space_photo",
          foreignField: "_id",
          as: "space_photo",
        },
      },
      {
        $lookup: {
          from: "venues",
          localField: "space.venue",
          foreignField: "_id",
          as: "venue_space",
        },
      },
      {
        $lookup: {
          from: "pricing",
          localField: "space.pricing",
          foreignField: "_id",
          as: "pricing",
        },
      },
      {
        $addFields: {
          space: {
            $cond: {
              if: { $ne: ["$space", null] },
              then: {
                $mergeObjects: [
                  "$space",
                  {
                    space_photo: "$space_photo",
                    pricing: "$pricing",
                    venue: {
                      $cond: {
                        if: { $gt: [{ $size: "$venue_space" }, 0] },
                        then: {
                          _id: { $arrayElemAt: ["$venue_space._id", 0] },
                          name: { $arrayElemAt: ["$venue_space.name", 0] },
                          address: {
                            street: { $arrayElemAt: ["$venue_space.address.street", 0] },
                            city: { $arrayElemAt: ["$venue_space.address.city", 0] },
                            state: { $arrayElemAt: ["$venue_space.address.state", 0] },
                            country: { $arrayElemAt: ["$venue_space.address.country", 0] },
                            postal_code: { $arrayElemAt: ["$venue_space.address.postal_code", 0] },
                            coordinates: {
                              latitude: { $arrayElemAt: ["$venue_space.address.coordinates.latitude", 0] },
                              longitude: { $arrayElemAt: ["$venue_space.address.coordinates.longitude", 0] },
                            },
                          },
                        },
                        else: null,
                      },
                    },
                  },
                ],
              },
              else: null,
            },
          },
        },
      },

      {
        $project: {
          action: 1,
          updatedAt: 1,
          venue: {
            $cond: {
              if: { $ne: ["$venue", null] },
              then: "$venue",
              else: "$$REMOVE",
            },
          },
          space: {
            $cond: {
              if: { $ne: ["$space", null] },
              then: {
                $mergeObjects: [{ user_log_id: "$_id" }, "$space", { space_photo: "$space_photo" }, { pricing: { $arrayElemAt: ["$pricing", 0] } }],
              },
              else: "$$REMOVE",
            },
          },
        },
      },
      {
        $match: {
          $or: [{ venue: { $ne: null } }, { space: { $ne: null } }],
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          },
          count: { $sum: 1 },
          venues: { $push: "$venue" },
          spaces: { $push: "$space" },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.day",
          action: 1,
          count: 1,
          venues: 1,
          spaces: 1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $sort: { date: -1 },
      },
    ];

    const result = await collection.aggregate(aggregationPipeline).toArray();
    return result;
  }

  static async updateUserlogs(query: Partial<TUserLogs>, update: Partial<TUserLogs>) {
    return this.collection().updateOne(query, { $set: update }, { upsert: true });
  }

  static async countUserLogs(query: any) {
    return this.collection()
      .aggregate([
        { $match: query },
        {
          $group: {
            _id: "$details.space",
            totalCount: { $sum: "$count" },
          },
        },
        { $sort: { totalCount: -1 } },
        {
          $project: {
            _id: 1,
            totalCount: 1,
          },
        },
      ])
      .toArray();
  }
}
