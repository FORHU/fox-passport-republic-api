import { AnyBulkWriteOperation } from "mongodb";

import { MSaleTransactions, TSaleTransactions, TUpdateSaleTransactions } from "../models/sale-transactions.model";
import { getDB } from "../utils/mongo";

export default class SaleTransactionRepo {
  static collection() {
    return getDB().collection("sale-transactions");
  }

  static createSaleTransaction(data: TUpdateSaleTransactions) {
    return this.collection().insertOne(new MSaleTransactions(data));
  }

  static async getSalesTransactions(data: TSaleTransactions, skip: number, limit: number) {
    const pipeline = [
      {
        $match: data,
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: "$userDetails._id",
            first_name: "$userDetails.first_name",
            last_name: "$userDetails.last_name",
            email: "$userDetails.email",
            phone_number: "$userDetails.phone_number",
          },
          venue: "$venue",
          remarks: 1,
          createdAt: 1,
          status: 1,
          updatedAt: 1,
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
        $unwind: {
          path: "$venueDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          user: 1,
          venue: { _id: "$venueDetails._id", name: "$venueDetails.name" },
          createdAt: 1,
          status: 1,
          remarks: 1,
          updatedAt: 1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async countSalesTransaction(query: TSaleTransactions) {
    return this.collection().countDocuments(query);
  }

  static async getUnpaginatedSalesTransactions(query: TSaleTransactions) {
    return this.collection().find(query).toArray();
  }

  static createOrUpdateSaleTransaction(data: Partial<TUpdateSaleTransactions>[]) {
    const now = new Date();

    const bulkOperations: AnyBulkWriteOperation<TUpdateSaleTransactions>[] = data.map((item) => ({
      updateMany: {
        filter: { venue: item.venue, user: item.user },
        update: {
          $set: { ...item },
          $setOnInsert: { createdAt: now },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    }));

    return this.collection().bulkWrite(bulkOperations);
  }

  static async deleteAssignedVenue(query: TSaleTransactions) {
    return this.collection().deleteOne(query);
  }

  static updateSaleTransaction(filter: Partial<TUpdateSaleTransactions>, data: Partial<TUpdateSaleTransactions>) {
    return this.collection().updateOne(filter, { $set: data });
  }
}
