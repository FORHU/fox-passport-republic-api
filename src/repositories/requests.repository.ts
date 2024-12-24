import { ObjectId } from "mongodb";

import { MRequests, TRequests } from "../models/requests.model";
import { getDB } from "../utils/mongo";

export default class RequestRepo {
  static collection() {
    return getDB().collection("requests");
  }

  static usersCollection() {
    return getDB().collection("users");
  }

  static async getRequests(query: any) {
    const result = await this.collection()
      .aggregate([
        { $match: query },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venueDetails",
          },
        },
        {
          $lookup: {
            from: "spaces",
            localField: "space",
            foreignField: "_id",
            as: "spaceDetails",
          },
        },
        {
          $lookup: {
            from: "enquiries",
            localField: "enquiry",
            foreignField: "_id",
            as: "enquiryDetails",
          },
        },
        {
          $lookup: {
            from: "custom-offer",
            localField: "custom_offer",
            foreignField: "_id",
            as: "customOfferDetails",
          },
        },
        {
          $lookup: {
            from: "bookings",
            localField: "booking",
            foreignField: "_id",
            as: "bookingDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$venueDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$spaceDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$enquiryDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$customOfferDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$bookingDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            user: {
              $mergeObjects: ["$userDetails"],
            },
            venue: {
              $mergeObjects: ["$venueDetails"],
            },
            space: {
              $mergeObjects: ["$spaceDetails"],
            },
            enquiry: {
              $mergeObjects: ["$enquiryDetails"],
            },
            custom_offer: {
              $mergeObjects: ["$customOfferDetails"],
            },
            booking: {
              $mergeObjects: ["$bookingDetails"],
            },
            request_data: 1,
            type: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 1,
            deletedBy: 1,
          },
        },
      ])
      .toArray();

    return result;
  }

  static async createRequest(data:Partial<MRequests>) {
    return this.collection().insertOne(data);
  }

  static async deleteRequest(request_id: ObjectId, data: Partial<TRequests>) {
    return this.collection().updateOne({ _id: request_id }, { $set: { data } });
  }

  static async updateRequest(request_id: ObjectId, data: Partial<TRequests>) {
    return this.collection().updateOne({ _id: request_id }, { $set: data });
  }

  static async approveDeletion(_id: ObjectId, data: Partial<TRequests>) {
    try {
      const result = await this.usersCollection().updateOne({ _id: _id }, { $set: data });
      return result;
    } catch (error) {
      throw error;
    }
  }
}
