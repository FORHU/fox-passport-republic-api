import CustomFacilitiesRepo from "../repositories/custom-facilities.repository";
import { TCustomFacilities, TUpdateCustomFacilities } from "../models/custom-facilities.model";

export default class CustomFacilitesSvc {
  static async createCustomFacilities(data: TCustomFacilities) {
    try {
      const insertedId = await CustomFacilitiesRepo.createCustomFacilities(data);
      return insertedId;
    } catch (error) {
      console.error("Error creating custom facilities:", error);
      throw error;
    }
  }

  static async updateCustomFacilities(data: TUpdateCustomFacilities) {
    try {
      const result = await CustomFacilitiesRepo.updateCustomFacilities(data);
      return result;
    } catch (error) {
      console.error("Error updating custom facilities:", error);
      throw error;
    }
  }
}
