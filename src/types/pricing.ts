export type DayPricing = {
  name: string;
  fullRateCheckkBox: boolean;
  hourlyCheckBox: boolean;
  slots: {
    start: string;
    end: string;
    rate: number | null;
  };
  full_day_rate: number | null;
  full_day_hours: number | null;
  currency: string;
};

export type HireFee = {
  days: DayPricing[];
  minimum_booking_hours: string;
  hire_fee_comment: string;
};

export type CustomPrice = {
  prices: {
    price: number;
    minimum_spend: number;
    duration: string;
    time: {
      from: string;
      to: string;
    };
    weekdays: string[];
    type: "MINIMUM_SPEND" | "HIRE_FEE" | "PACKAGE_FEE" | "HIRE_FEE_MINIMUM_SPEND";
  }[];
  opening_hours_private_hour: boolean;
  flexible_pricing_description: string;
  pricing_description: string;
  catering_prices_description: string;
  package_per_person_description: string;
  opening_hours_preview: {
    [day: string]: {
      from: string;
      to: string;
    };
  };
};
