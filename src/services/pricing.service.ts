import { ObjectId } from "mongodb";
import { TPrice } from "../models/pricing.model";
import PricingRepo from "../repositories/pricing.repository";
import { logger } from "../utils/logger";

export default class PricingSvc {
  static async getPrice(query: any) {
    try {
      const price = await PricingRepo.getPrice(query);
      return price;
    } catch (error) {
      console.error("Error getting price:", error);
      throw error;
    }
  }

  static async getPrices(query: any) {
    try {
      const prices = await PricingRepo.getPrices(query);
      return prices;
    } catch (error) {
      logger.log({
        level: "error",
        message: `[PRICE]: PRICE FETCH ERROR: ${JSON.stringify(error)}`,
      });
      throw error;
    }
  }

  static async createPrice(query: any) {
    try {
      const price = await PricingRepo.createPrice(query);
      return price;
    } catch (error) {
      console.error("Error getting price:", error);
      throw error;
    }
  }

  static async updatePrice(spaceId: ObjectId, updatedData: TPrice) {
    try {
      const price = await PricingRepo.updatePrice(spaceId, updatedData);
      return price;
    } catch (error) {
      console.error("Error getting price:", error);
      throw error;
    }
  }
}
