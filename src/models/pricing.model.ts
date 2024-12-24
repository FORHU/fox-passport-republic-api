import { ObjectId } from "mongodb";

export enum WeekdaysType {
  "MONDAY" = "MONDAY",
  "TUESDAY" = "TUESDAY",
  "WEDNESDAY" = "WEDNESDAY",
  "THURSDAY" = "THURSDAY",
  "FRIDAY" = "FRIDAY",
  "SATURDAY" = "SATURDAY",
  "SUNDAY" = "SUNDAY",
}

interface hourlyDetails {
  start: string;
  end: string;
  rate: number | null;
}

type HireFee = {
  days: [
    {
      name: WeekdaysType;
      fullRateCheckkBox: boolean;
      full_day_hours: number | null;
      hourlyCheckBox: boolean;
      slots: hourlyDetails;
      full_day_rate: number | null;
      currency: string;
    },
  ];
  minimum_booking_hours?: string | number | null;
  hire_fee_comment?: string | "";
};

export enum PriceType {
  MINIMUM_SPEND = "MINIMUM_SPEND",
  HIRE_FEE = "HIRE_FEE",
  PACKAGE_FEE = "PACKAGE_FEE",
  HIRE_FEE_MINIMUM_SPEND = "HIRE_FEE_MINIMUM_SPEND",
  HIRE_FEE_PACKAGE_FEE = "HIRE_FEE_PACKAGE_FEE",
}

export enum PricingOptions {
  HIRE_FEE = "HIRE_FEE",
  CUSTOM_PRICE = "CUSTOM_PRICE",
}

export enum PriceFlexibility {
  PRICES_ARE_OPEN_TO_NEGOTIATION = "PRICES_ARE_OPEN_TO_NEGOTIATION",
  PRICES_ARE_NEGOTIABLE_IN_CERTAIN_CASES = "PRICES_ARE_NEGOTIABLE_IN_CERTAIN_CASES",
  OUR_PRICES_ARE_SET = "OUR_PRICES_ARE_SET",
}

interface StartEndTime {
  from?: string;
  to?: string;
}

type CustomPrice = {
  prices: [
    {
      price: number | null;
      minimum_spend?: number | null;
      package_per_person?: number | null;
      duration: string | null;
      time: {
        from: string | "";
        to: string | "";
      };
      weekDays: WeekdaysType[];
      type: PriceType;
    },
  ];
  opening_hours_private_hour?: boolean;
  opening_hours_preview?: { time: StartEndTime; weekdays: WeekdaysType[] };
  flexible_pricing_description?: PriceFlexibility | "";
  pricing_description?: string | "";
  catering_prices_description?: string | "";
  package_per_person_description?: string | "";
};

export interface TPrice {
  _id?: ObjectId;
  space_id: ObjectId;
  selected_pricing: PricingOptions;
  hire_fee: {
    days: HireFee;
  };
  custom_price: CustomPrice;
  currency: string;
  cleaning_fee?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export interface TUpdatePrice {
  _id?: ObjectId;
  updatedAt?: Date;
}

export class MPrice implements Partial<TPrice> {
  _id?: ObjectId;
  space_id: ObjectId;
  selected_pricing: PricingOptions;
  hire_fee: {
    days: HireFee;
  };
  custom_price?: CustomPrice;
  currency: string;
  cleaning_fee?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;

  constructor({ _id = new ObjectId(), space_id, selected_pricing, hire_fee, custom_price, currency, cleaning_fee }: TPrice) {
    this._id = _id;
    this.space_id = space_id;
    this.selected_pricing = selected_pricing;
    this.hire_fee = hire_fee;
    this.custom_price = custom_price;
    this.currency = currency;
    this.cleaning_fee = cleaning_fee;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.deletedAt = new Date();
  }
}
