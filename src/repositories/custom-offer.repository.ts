import { ObjectId } from "mongodb";

import { MCustomOffer, TCustomOffer } from "../models/custom-offer.model";
import { getDB } from "../utils/mongo";

export default class CustomOfferRepo {
  static collection() {
    return getDB().collection("custom-offer");
  }

  static async createCustomOffer(data: TCustomOffer) {
    return this.collection().insertOne(new MCustomOffer(data));
  }

  static async getCustomOffer(query: any) {
    try {
      const pipeline = [
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venue",
          },
        },
        {
          $unwind: "$venue",
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
            from: "enquiries",
            localField: "enquiry_id",
            foreignField: "_id",
            as: "enquiry",
          },
        },
        {
          $lookup: {
            from: "bookings",
            localField: "booking",
            foreignField: "_id",
            as: "booking",
          },
        },
        {
          $lookup: {
            from: "invoices",
            localField: "invoice",
            foreignField: "_id",
            as: "invoice",
          },
        },
        {
          $match: {
            deletedAt: { $eq: null },
          },
        },
        {
          $match: query,
        },
        {
          $project: {
            user: { $arrayElemAt: ["$user", 0] },
            inbox: 1,
            venue: {
              _id: "$venue._id",
              name: "$venue.name",
              address: "$venue.address",
            },
            space: { $arrayElemAt: ["$space", 0] },
            enquiry: { $arrayElemAt: ["$enquiry", 0] },
            booking: { $arrayElemAt: ["$booking", 0] },
            invoice: { $arrayElemAt: ["$invoice", 0] },
            date: 1,
            guests: 1,
            rental_amount: 1,
            status: 1,
            notes: 1,
            agree_to_terms: 1,
            message_to_owner: 1,
            venue_computation: 1,
            user_computation: 1,
            createdAt: 1,
            updatedAt: 1,
            currency: 1,
          },
        },
      ];

      const result = await this.collection().aggregate(pipeline).toArray();
      return result;
    } catch (error) {
      throw new Error(`Error retrieving custom offers: ${error}`);
    }
  }

  static async archiveCustomOffers(query: any, update: any) {
    try {
      if (query.user) query.user = new ObjectId(query.user);
      const result = await this.collection().updateMany(query, update);
      return result.modifiedCount;
    } catch (error) {
      throw new Error(`Error updating custom offers: ${error}`);
    }
  }

  static async updateCustomOffer(_id: ObjectId, data: any) {
    const update = {
      $set: data,
    };

    try {
      const result = await this.collection().updateOne({ _id: _id }, update);
      return result.modifiedCount;
    } catch (error) {
      throw new Error(`Error updating custom offer: ${error}`);
    }
  }

  static async deleteCustomOffer(inbox_id: ObjectId) {
    return this.collection().deleteMany({ inbox: inbox_id });
  }

  static async createOrUpdateCustomOffer(query: any, payload: any, options?: any) {
    const result = await this.collection().updateOne(query, { $set: payload }, options);
    return result;
  }
}
