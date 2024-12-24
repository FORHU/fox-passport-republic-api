import { ObjectId } from "mongodb";

export enum CancellationPolicy {
  VERY_FLEXIBLE = "VERY_FLEXIBLE",
  FLEXIBLE = "FLEXIBLE",
  STANDARD_30 = "STANDARD_30",
  STANDARD_60 = "STANDARD_60",
  CUSTOM = "CUSTOM",
  OTHER = "OTHER",
}

export interface TCancellationPolicy {
  _id?: ObjectId;
  venue_id?: ObjectId;
  description?: string | null | "";
  policy?: {
    cancellation_range?: CancellationPolicy | null | "";
    custom: {
      days_at_least?: {
        //greater than the number of days before event
        number_of_days?: number | null | "";
        total_price?: number | null | ""; //percentage of total hire cost to be paid to venue owner
      };
      days_less_than?: {
        //within the number of days before the event
        number_of_days?: number | null | "";
        total_price?: number | null | "";
      };
      days_less_than_but_at_least?: {
        //within and greater than number of days before the event
        days_less_than?: number | null | "";
        days_at_least?: number | null | "";
        total_price?: number | null | "";
      }[];
    };
    no_cancellation?: boolean;
  };
  allow_rescheduling?: {
    answer: boolean | null | "";
    months: number | null | "";
  };
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  deletedBy?: ObjectId | null;
}

export interface TUpdateCancellationPolicy {
  description?: string | null | "";
  policy?: {
    cancellation_range?: CancellationPolicy | null | "";
    custom: {
      days_at_least?: {
        number_of_days?: number | null | "";
        total_price?: number | null | "";
      };
      days_less_than?: {
        number_of_days?: number | null | "";
        total_price?: number | null | "";
      };
      days_less_than_but_at_least?: {
        days_less_than?: number | null | "";
        days_at_least?: number | null | "";
        total_price?: number | null | "";
      }[];
    };
    no_cancellation?: boolean;
  };
  allow_rescheduling?: {
    answer?: boolean | null;
    months?: number | null | "";
  };
  updatedAt?: Date;
}

export class MCancellationPolicy implements TCancellationPolicy {
  _id?: ObjectId;
  venue_id?: ObjectId;
  description?: string | null | "";
  policy?: {
    cancellation_range?: CancellationPolicy | null | "";
    custom: {
      days_at_least?: {
        number_of_days?: number | null | "";
        total_price?: number | null | "";
      };
      days_less_than?: {
        number_of_days?: number | null | "";
        total_price?: number | null | "";
      };
      days_less_than_but_at_least?: {
        days_less_than?: number | null | "";
        days_at_least?: number | null | "";
        total_price?: number | null | "";
      }[];
    };
    no_cancellation?: boolean;
  };
  allow_rescheduling?: {
    answer: boolean | null | "";
    months: number | null | "";
  };
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  deletedBy?: ObjectId | null;

  constructor({
    _id = new ObjectId(),
    venue_id = new ObjectId(),
    description = "",
    policy = {
      cancellation_range: CancellationPolicy.VERY_FLEXIBLE,
      custom: {},
      no_cancellation: false,
    },
    allow_rescheduling = { answer: false, months: 0 },
    createdAt = new Date(),
    updatedAt = new Date(),
    deletedAt = null,
    deletedBy = null,
  }: TCancellationPolicy = {}) {
    this._id = _id;
    this.venue_id = venue_id;
    this.description = description;
    this.policy = policy;
    this.allow_rescheduling = allow_rescheduling;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
