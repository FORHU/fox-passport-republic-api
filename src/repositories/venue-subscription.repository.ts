import { MVenueSubscription, TVenueSubscription } from "../models/venue-subscription.model";
import { getDB } from "../utils/mongo";

export default class VenueSubscriptionRepo {
  static collection() {
    return getDB().collection("space-subscription");
  }

  static createVenueSubscription(data: TVenueSubscription) {
    return this.collection().insertOne(new MVenueSubscription(data));
  }

  static async getVenueSubscription(query: any) {
    return await this.collection().find(query).toArray();
  }

  static async updateVenueSubscription(query: TVenueSubscription, data: Partial<TVenueSubscription>) {
    return this.collection().updateMany(query, { $set: data });
  }

  static async deleteVenueSubscription(query: any) {
    return this.collection().deleteMany(query);
  }

  static async getOneVenueSubscription(query: any) {
    return await this.collection().findOne(query);
  }
}
