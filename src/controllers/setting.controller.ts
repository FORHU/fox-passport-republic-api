import SalesSettingSvc from "../services/setting.service";
import { Request, Response } from "express";
import { handleResponse, handleErrorResponse } from "../utils/reponse";
import { TSetting } from "../models/setting.model";

export default class SalesSettingCtrl {
  static async createOrUpdateSetting(req: Request, res: Response) {
    try {
      const result = await SalesSettingSvc.createOrUpdateSetting(req.body);
      return handleResponse(res, result, "SALES_SETTING_CREATED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "SALES_SETTING_CREATION_FAILED" });
    }
  }

  static async getSettings(req: Request, res: Response) {
    try {
      const {} = req.query as TSetting;
      const query: TSetting = {};

      const result = await SalesSettingSvc.getSettings(query);
      return handleResponse(res, result, "SALES_SETTING_FETCHED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "SALES_SETTING_FETCH_FAILED" });
    }
  }
}
