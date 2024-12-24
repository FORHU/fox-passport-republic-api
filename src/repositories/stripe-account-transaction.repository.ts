import { MStripeAccountTransaction, TStripeAccountTransaction } from "../models/stripe-account-transaction.model";
import { getDB } from "../utils/mongo";

export default class StripeAccountTransactionRepo {
  static collection() {
    return getDB().collection("stripe-account-transaction");
  }

  static async getAccount(query: any) {
    const pipeline = [
      {
        $lookup: {
          from: "enquiries",
          localField: "enquiry",
          foreignField: "_id",
          as: "enquiry",
        },
      },
      {
        $lookup: {
          from: "stripe-account",
          localField: "stripe_account",
          foreignField: "_id",
          as: "stripe_account",
        },
      },
      {
        $match: query,
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          enquiry: 1,
          stripe_account: { $arrayElemAt: ["$stripe_account", 0] },
          payment: 1,
          venue: 1,
          space: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async getAccounts(query: any, offset: number, limit: number) {
    const pipeline = [
      {
        $lookup: {
          from: "enquiries",
          localField: "enquiry",
          foreignField: "_id",
          as: "enquiry",
        },
      },
      {
        $lookup: {
          from: "stripe-account",
          localField: "stripe_account",
          foreignField: "_id",
          as: "stripe_account",
        },
      },
      {
        $match: query,
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: offset,
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          enquiry: 1,
          stripe_account: { $arrayElemAt: ["$stripe_account", 0] },
          payment: 1,
          venue: 1,
          space: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async countAccounts(query: any) {
    return this.collection().countDocuments(query);
  }

  static async createPaymentTransaction(data: TStripeAccountTransaction) {
    return this.collection().insertOne(new MStripeAccountTransaction(data));
  }

  static async updatePaymentTransaction(query: any, data: any) {
    return this.collection().updateOne(query, { $set: data });
  }

  static async updateManyPaymentTransaction(query: any, data: any) {
    return this.collection().updateMany(query, { $set: data });
  }
}
