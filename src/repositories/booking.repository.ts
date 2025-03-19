import { ObjectId } from "mongodb";

import { MBooking, TBooking } from "../models/booking.model";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const PREFIX = "bookings";
export default class BookingRepo {
  static collection() {
    return getDB().collection("bookings");
  }

  static async createBookings(data: TBooking) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    return this.collection().insertOne(new MBooking(data));
  }

  static async createMultipleBookings(data: TBooking[]) {
    return this.collection().insertMany(data.map((item) => new MBooking(item)));
  }

  static async getAllBookings(query: any) {
    return this.collection().find(query).toArray();
  }

  static async getBookings(query: any, skip: number, limit: number, session?: boolean) {
    const pipeline = [
      {
        $lookup: {
          from: "enquiries",
          localField: "enquiry",
          foreignField: "_id",
          as: "enquiry_details",
        },
      },
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
          localField: "booked_user",
          foreignField: "_id",
          as: "booked_user",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "booker",
          foreignField: "_id",
          as: "booker_user",
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
        $match: query,
      },
      {
        $project: {
          _id: 1,
          space_id: { $arrayElemAt: ["$space._id", 0] },
          space_name: { $arrayElemAt: ["$space.name", 0] },
          venue_id: { $arrayElemAt: ["$venue._id", 0] },
          venue_name: { $arrayElemAt: ["$venue.name", 0] },
          enquiry: { $ifNull: ["$enquiry", null] },
          booking_reference: 1,
          event_type: 1,
          optional_input: 1,
          start_date: 1,
          end_date: 1,
          total_guest: 1,
          event_duration: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1,
          deletedBy: 1,
          cancelledAt: 1,
          cancelledBy: {
            _id: { $arrayElemAt: ["$cancelled_user._id", 0] },
            role: { $arrayElemAt: ["$cancelled_user.role", 0] },
          },
          booker_user_first_name: {
            $cond: {
              if: { $eq: [session, false] },
              then: "$$REMOVE",
              else: { $arrayElemAt: ["$booker_user.first_name", 0] },
            },
          },
          booker_user_last_name: {
            $cond: {
              if: { $eq: [session, false] },
              then: "$$REMOVE",
              else: { $arrayElemAt: ["$booker_user.last_name", 0] },
            },
          },
          booker_user_email: {
            $cond: {
              if: { $eq: [session, false] },
              then: "$$REMOVE",
              else: { $arrayElemAt: ["$booker_user.email", 0] },
            },
          },
          total_price: {
            $cond: {
              if: { $eq: [session, false] },
              then: "$$REMOVE",
              else: "$total_price",
            },
          },
        },
      },
      { $skip: skip },
      { $limit: limit },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async countBookings(query: any) {
    const pipeline = [
      {
        $lookup: {
          from: "enquiries",
          localField: "enquiry",
          foreignField: "_id",
          as: "enquiry_details",
        },
      },
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
          localField: "booked_user",
          foreignField: "_id",
          as: "booked_user",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "booker",
          foreignField: "_id",
          as: "booker_user",
        },
      },
      {
        $match: query,
      },
      {
        $count: "totalBookings",
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result.length > 0 ? result[0].totalBookings : 0;
  }

  static async updateBooking(booking_id: ObjectId, updateData: any) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    const where = { _id: booking_id };
    const updateDocument = {
      $set: {
        ...updateData,
        updatedAt: new Date(),
      },
    };
    return await this.collection().updateOne(where, updateDocument);
  }

  static async deleteBooking(booking_id: ObjectId, deletedBy: ObjectId) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    const where = { _id: booking_id };
    const updateDocument = {
      $set: {
        deletedBy,
        deletedAt: new Date(),
      },
    };
    return await this.collection().updateOne(where, updateDocument);
  }
}
