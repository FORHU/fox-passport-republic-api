import { ObjectId } from "mongodb";

import { MEnquiries, TEnquiries } from "../models/enquiries.model";
import { user_role } from "../models/user.model";
import { getDB } from "../utils/mongo";

export default class EnquiryRepo {
  static collection() {
    return getDB().collection("enquiries");
  }

  static createEnquiries(data: TEnquiries) {
    return this.collection().insertOne(new MEnquiries(data));
  }

  static async getOneEnquiry(inboxId: ObjectId) {
    try {
      return await this.collection().findOne({ inbox: inboxId });
    } catch (error) {
      throw new Error(`Error retrieving enquiry: ${error}`);
    }
  }

  static async getEnquiries(query: any, skip?: number, limit?: number, toggle_censor?: boolean) {
    const pipeline = [];

    pipeline.push(
      {
        $lookup: {
          from: "venues",
          localField: "venue",
          foreignField: "_id",
          as: "venue",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "space",
          foreignField: "_id",
          as: "space",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "venue.user",
          foreignField: "_id",
          as: "venue_user",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "venue_user.profile_picture",
          foreignField: "_id",
          as: "profile_picture_file",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "user.profile_picture",
          foreignField: "_id",
          as: "user_profile_picture_file",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "cancelledBy",
          foreignField: "_id",
          as: "cancelled_user",
        },
      },
      {
        $lookup: {
          from: "inboxes",
          localField: "inbox",
          foreignField: "_id",
          as: "inbox",
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { inboxId: { $arrayElemAt: ["$inbox._id", 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$inbox", "$$inboxId"],
                },
              },
            },
            {
              $sort: { createdAt: -1 },
            },
            {
              $limit: 1,
            },
          ],
          as: "latest_message",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "space.space_photo",
          foreignField: "_id",
          as: "space_photos",
        },
      },
    );

    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query });
    }

    const currentDate = new Date();
    const seventyTwoHoursAgo = new Date(currentDate);
    seventyTwoHoursAgo.setHours(currentDate.getHours() - 72);

    pipeline.push({
      $project: {
        _id: 1,
        full_name: 1,
        date: 1,
        type: 1,
        guests: 1,
        value: 1,
        space: {
          $mergeObjects: [{ $arrayElemAt: ["$space", 0] }, { space_photo: "$space_photos" }],
        },
        venue: {
          $mergeObjects: [
            { $arrayElemAt: ["$venue", 0] },
            {
              user: {
                _id: { $arrayElemAt: ["$venue_user._id", 0] },
                first_name: { $arrayElemAt: ["$venue_user.first_name", 0] },
                last_name: { $arrayElemAt: ["$venue_user.last_name", 0] },
                email: { $arrayElemAt: ["$venue_user.email", 0] },
                role: { $arrayElemAt: ["$venue_user.role", 0] },
                profile_picture: {
                  $arrayElemAt: ["$profile_picture_file.path", 0],
                },
                phone_number: {
                  $cond: {
                    if: { $eq: [{ $arrayElemAt: ["$venue_user.role", 0] }, user_role.VENUE_OWNER] },
                    then: toggle_censor
                      ? { $arrayElemAt: ["$venue_user.phone_number", 0] }
                      : {
                          $concat: [
                            { $substr: [{ $arrayElemAt: ["$venue_user.phone_number", 0] }, 0, 3] },
                            "****",
                            { $substr: [{ $arrayElemAt: ["$venue_user.phone_number", 0] }, 10, -1] },
                          ],
                        },
                    else: { $arrayElemAt: ["$venue_user.phone_number", 0] },
                  },
                },
              },
            },
          ],
        },
        inbox: { $arrayElemAt: ["$inbox", 0] },
        user: {
          $mergeObjects: {
            _id: { $arrayElemAt: ["$user._id", 0] },
            first_name: { $arrayElemAt: ["$user.first_name", 0] },
            last_name: { $arrayElemAt: ["$user.last_name", 0] },
            email: { $arrayElemAt: ["$user.email", 0] },
            profile_picture: {
              $arrayElemAt: ["$user_profile_picture_file.path", 0],
            },
          },
        },
        status: 1,
        own_catering: 1,
        require_catering: 1,
        catering_options: 1,
        latest_message: {
          $mergeObjects: [{ $arrayElemAt: ["$latest_message", 0] }],
        },
        flexible_time: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: 1,
        deletedBy: 1,
        cancelledAt: 1,
        cancelledBy: {
          _id: { $arrayElemAt: ["$cancelled_user._id", 0] },
          role: { $arrayElemAt: ["$cancelled_user.role", 0] },
        },
      },
    });

    pipeline.push({ $sort: { "latest_message.createdAt": -1 } });
    pipeline.push({ $skip: skip }, { $limit: limit });

    const result = await this.collection().aggregate(pipeline).toArray();

    return result;
  }

  static async countEnquiries(query: any) {
    const pipeline = [];

    pipeline.push(
      {
        $lookup: {
          from: "venues",
          localField: "venue",
          foreignField: "_id",
          as: "venue",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "space",
          foreignField: "_id",
          as: "space",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "inboxes",
          localField: "inbox",
          foreignField: "_id",
          as: "inbox",
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { inboxId: { $arrayElemAt: ["$inbox._id", 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$inbox", "$$inboxId"],
                },
              },
            },
            {
              $sort: { createdAt: -1 },
            },
            {
              $limit: 1,
            },
          ],
          as: "latest_message",
        },
      },
    );

    // Match the initial query if provided
    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query });
    }

    // Final count stage
    pipeline.push({
      $count: "count",
    });

    // Execute the pipeline and get the result
    const result = await this.collection().aggregate(pipeline).toArray();
    return result.length > 0 ? result[0].count : 0;
  }

  static async getOneEnquiryPhoto(space_id: ObjectId) {
    try {
      const pipeline = [
        {
          $match: { space: space_id },
        },
        {
          $lookup: {
            from: "spaces",
            localField: "space",
            foreignField: "_id",
            as: "space",
          },
        },
        {
          $lookup: {
            from: "spaces",
            localField: "space.name",
            foreignField: "name",
            as: "matched_space",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "matched_space.space_photo",
            foreignField: "_id",
            as: "space.space_photos",
          },
        },
        {
          $project: {
            space_id: 1,
            name: { $arrayElemAt: ["$matched_space.name", 0] },
            space_photos: {
              $map: {
                input: "$space.space_photos",
                as: "photo",
                in: {
                  _id: "$$photo._id",
                  filename: "$$photo.filename",
                },
              },
            },
          },
        },
      ];

      const result = await this.collection().aggregate(pipeline).toArray();
      if (!result || result.length === 0) {
        throw new Error("Enquiry not found");
      }
      return result[0];
    } catch (error) {
      throw new Error(`Error retrieving enquiry photos: ${error}`);
    }
  }

  static updateEnquiry(query: any, data: any) {
    return this.collection().updateOne(query, { $set: data });
  }

  static async getEnquiry(query: any) {
    try {
      return this.collection().find(query).toArray();
    } catch (error) {
      throw new Error(`Error retrieving enquiries: ${error}`);
    }
  }

  static async countAllEnquiries(query: any) {
    const countByStatusArray = await this.collection()
      .aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray();

    const totalCount = countByStatusArray.reduce((total, statusCount) => total + statusCount.count, 0);

    const count = countByStatusArray.reduce((acc, statusCount) => {
      acc[statusCount._id] = {
        status: statusCount._id,
        count: statusCount.count,
      };
      return acc;
    }, {});

    count["TOTAL"] = {
      status: "ALL",
      count: totalCount,
    };

    return count;
  }

  static async deleteEnquiry(_id: ObjectId, data: any) {
    const result = await this.collection().updateOne({ _id: _id }, { $set: data });

    if (result.modifiedCount === 0) {
      throw new Error("Venue not found");
    }
    return result;
  }
}
