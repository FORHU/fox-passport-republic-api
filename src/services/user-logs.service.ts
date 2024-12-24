import { ObjectId } from "mongodb";
import { TUserLogs } from "../models/user-logs.model";
import UserLogsRepo from "../repositories/user-logs.repository";
import { getSummarizedPricing, PricingData } from "../utils/helpers";
import PricingRepo from "../repositories/pricing.repository";

export default class UserLogsSvc {
  static createUserLogs(logs: TUserLogs) {
    return UserLogsRepo.createUserLogs(logs);
  }

  static async getUser(query: Partial<TUserLogs>) {
    return await UserLogsRepo.getUser(query);
  }

  static async getUserLogs(query: any, skip = 0, limit = 10) {
    try {
      const result = await UserLogsRepo.getUserLogs(query, skip, limit);

      const spacesMap = result
        .flatMap((log) => log.spaces)
        .reduce((acc, space) => {
          acc[space._id] = space;
          return acc;
        }, {});

      const spaceIdList = Object.keys(spacesMap).map((id) => new ObjectId(id));

      const priceList = await PricingRepo.getPrices({ space_id: { $in: spaceIdList } });

      const transformedPriceList: PricingData[] = priceList.map((price: any) => ({
        space_id: price.space_id.toString(),
        selected_pricing: price.selected_pricing || null,
        currency: price.currency || "USD",
        hire_fee: price.hire_fee || 0,
        cleaning_fee: price.cleaning_fee || 0,
        custom_price: price.custom_price || 0,
      }));

      const summarizedPricing = await getSummarizedPricing(transformedPriceList);

      const pricingMap = new Map<string, any>();

      summarizedPricing.forEach((item: any) => {
        if (pricingMap.has(item.space_id)) {
          const existing = pricingMap.get(item.space_id);
          if (item.selected_pricing === "CUSTOM_PRICE") {
            existing.selected_pricing = "CUSTOM_PRICE";
          }
          existing.pricing = [...existing.pricing, ...item.pricing];
        } else {
          pricingMap.set(item.space_id, item);
        }
      });

      const updatedList = result.map((result: any) => ({
        ...result,
        spaces: result.spaces.map((space: any) => ({
          ...space,
          pricing_summary: pricingMap.get(space._id?.toString()) || null,
        })),
      }));

      return updatedList;
    } catch (error) {
      throw new Error("Unable to fetch user logs and pricing details.");
    }
  }

  static async updateUserlogs(query: any, update: Partial<TUserLogs>) {
    return await UserLogsRepo.updateUserlogs(query, update);
  }

  static async deleteUserLogs(query: any) {
    return await UserLogsRepo.deleteUserLog(query);
  }

  static async countUserLogs(query: any) {
    return await UserLogsRepo.countUserLogs(query);
  }
}
