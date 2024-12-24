import { ObjectId } from "mongodb";
import SalesSettingRepo from "../repositories/setting.repository";
import { TSetting } from "../models/setting.model";

export default class SalesSettingSvc {
  static createOrUpdateSetting(data: TSetting) {
    return SalesSettingRepo.createOrUpdateSetting(data);
  }

  static async getSettings(query: TSetting) {
    return SalesSettingRepo.getSettings(query);
  }
}
