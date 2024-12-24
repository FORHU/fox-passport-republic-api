import { ObjectId } from "mongodb";

export type TCountrySetting = {
  _id?: ObjectId;
  country_name: string;
  flag_url?: string;
  country_code?: string;
  currency?: string;
  currency_sign?: string;
  commission?: number;
  rebate?: number | 0;
  status?: string;
  photo?: ObjectId[];
  cca2?: string;
  isDefault?: Boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MCountrySetting implements Partial<TCountrySetting> {
  _id?: ObjectId;
  country_name: string;
  flag_url?: string;
  country_code?: string;
  currency?: string;
  currency_sign?: string;
  commission?: number;
  rebate?: number | 0;
  status?: string;
  photo?: ObjectId[];
  cca2?: string;
  isDefault?: Boolean;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      country_name,
      flag_url,
      country_code,
      currency,
      currency_sign,
      commission,
      rebate,
      status,
      photo,
      cca2,
      isDefault = false,
      createdAt = new Date(),
      updatedAt,
    } = {} as TCountrySetting,
  ) {
    this._id = _id;
    this.commission = commission;
    this.country_name = country_name;
    this.country_code = country_code;
    this.currency = currency;
    this.currency_sign = currency_sign;
    this.flag_url = flag_url;
    this.rebate = rebate;
    this.status = status;
    this.photo = photo;
    this.cca2 = cca2;
    this.isDefault = isDefault;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
