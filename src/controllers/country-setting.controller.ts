import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import CountrySettingSvc from "../services/country-setting.service";
import { validateCreateCountry, validateListCountrySetting, validateUpdateCountry } from "../utils/country-setting/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

const parseObjectIdArray = (array: string[] | undefined): ObjectId[] | null => {
  return array ? array.map((_id: string) => new ObjectId(_id)) : null;
};

export default class CountrySettingCtrl {
  static async createCountry(req: Request, res: Response) {
    const { country_name, commission, rebate, status, photo, isDefault } = req.body;

    const { error } = validateCreateCountry(req.body);
    if (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_CREATE_COUNTRY",
      });
    }

    if (isDefault) {
      const [existingDefault] = await CountrySettingSvc.getCountrySetting({ isDefault: true });
      if (existingDefault) await CountrySettingSvc.updateCountrySetting({ _id: existingDefault._id }, { isDefault: false });
    }

    const results = await CountrySettingSvc.createCountrySetting({
      country_name,
      ...(commission !== undefined && { commission }),
      ...(rebate !== undefined && { rebate }),
      status,
      photo: parseObjectIdArray(photo) ?? [],
      ...(isDefault && { isDefault }),
    });

    return handleResponse(res, results, "CREATE_COUNTRY");
  }

  static async updateCountrySetting(req: Request, res: Response) {
    const _id = req.params.id;
    const { commission, rebate, status, photo, isDefault } = req.body;

    const { error } = validateUpdateCountry(req.body);
    if (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_UPDATE_COUNTRY",
      });
    }

    if (isDefault) {
      const [existingDefault] = await CountrySettingSvc.getCountrySetting({ isDefault: true });
      if (existingDefault) await CountrySettingSvc.updateCountrySetting({ _id: existingDefault._id }, { isDefault: false });
    }

    const payload = {
      ...(commission !== undefined && { commission }),
      ...(rebate !== undefined && { rebate }),
      ...(status && { status }),
      ...(photo && { photo: parseObjectIdArray(photo) ?? [] }),
      ...(isDefault && { isDefault }),
      updatedAt: new Date(),
    };

    const results = await CountrySettingSvc.updateCountrySetting({ _id: new ObjectId(_id) }, payload);

    return handleResponse(res, results, "UPDATE_COUNTRY");
  }

  static async getCountrySetting(req: Request, res: Response) {
    const { _id } = req.query as any;
    const query: any = {};
    if (_id) {
      query._id = new ObjectId(_id);
    }
    const results = await CountrySettingSvc.getCountrySetting(query);
    return handleResponse(res, results, "FETCH_COUNTRY");
  }

  static async getListCountrySetting(req: Request, res: Response) {
    try {
      const { error } = validateListCountrySetting(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "ERROR_VALIDATION" });
      }

      const response = await CountrySettingSvc.getPaginatedCountrySetting(req.query);
      return handleResponse(res, response, "FETCH_LISTED_COUNTRY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
  static async getCountrySettingById(req: Request, res: Response) {
    const _id = req.params.id as string;
    const query: any = {};
    if (_id) {
      query._id = new ObjectId(_id);
    }
    const [results] = await CountrySettingSvc.getCountrySetting(query);
    return handleResponse(res, results, "FETCH_COUNTRY_BY_ID");
  }

  static async deleteCountrySetting(req: Request, res: Response) {
    const _id = req.params.id as string;
    const query: any = { _id: new ObjectId(_id) };
    const result = await CountrySettingSvc.deleteCountrySetting(query);
    return handleResponse(res, result, "DELETE_COUNTRY_BY_ID");
  }
}
