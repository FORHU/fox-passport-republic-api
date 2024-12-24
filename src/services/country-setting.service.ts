import { ObjectId } from "mongodb";
import { TCountrySetting } from "../models/country-setting.model";
import CountrySettingRepo from "../repositories/country-setting.repository";
import { getCountryData } from "../utils/restcountries";

export default class CountrySettingSvc {
  static async createCountrySetting(data: TCountrySetting) {
    const { country_name, flag_url, country_code, currency, currency_sign, cca2 }: any = await getCountryData(data.country_name);
    return CountrySettingRepo.createCountrySetting({
      country_name,
      flag_url,
      country_code,
      currency,
      currency_sign,
      commission: data.commission,
      rebate: data.rebate,
      photo: data.photo,
      status: data.status,
      cca2,
    });
  }

  static async getCountrySetting(query: any) {
    return CountrySettingRepo.getCountrySetting(query);
  }
  static async getPaginatedCountrySetting(params: any) {
    const { page = 1, limit = 10, _id, search } = params as any;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    const query: any = {};
    if (_id) query._id = new ObjectId(_id);
    if (search) query.country_name = new RegExp(search, "i");

    const skip = (pageNumber - 1) * limitNumber;
    const totalItems = await this.countCountrySetting(query);
    const results = await this.getListCountrySetting(query, pageNumber, limitNumber);
    const totalPages = Math.ceil(totalItems / limitNumber);

    const response = {
      data: results,
      total_pages: totalPages,
      total_items: totalItems,
      current_page: pageNumber,
      size: limitNumber,
      offset: skip,
    };
    return response;
  }
  static async getListCountrySetting(query: any, page: number, limit: number) {
    return CountrySettingRepo.getListCountrySetting(query, page, limit);
  }
  static async countCountrySetting(query: any) {
    return CountrySettingRepo.countCountrySetting(query);
  }

  static async updateCountrySetting(query: any, payload: any) {
    return CountrySettingRepo.updateCountrySetting(query, payload);
  }

  static async deleteCountrySetting(query: any) {
    return CountrySettingRepo.deleteCountrySetting(query);
  }
}
