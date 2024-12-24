import { ObjectId } from "mongodb";

export enum enquiry_status {
  ACTIVE = "ACTIVE",
  NEW = "NEW",
  IN_PROGRESS = "IN_PROGRESS",
  PAYMENT_IN_PROGRESS = "PAYMENT_IN_PROGRESS",
  BOOKING_CONFIRMED = "BOOKING_CONFIRMED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  CUSTOM_OFFER_SENT = "CUSTOM_OFFER_SENT",
  HAPPENED = "HAPPENED",
  COMMISSION_DUE = "COMMISSION_DUE",
  ARCHIVED = "ARCHIVED",
  CANCELLED = "CANCELLED",
  DECLINED = "DECLINED",
  OFFER_ACCEPTED = "OFFER_ACCEPTED",
  REQUESTED_FOR_CANCELLATION = "REQUESTED_FOR_CANCELLATION",
  BOOKING_REQUESTED = "BOOKING_REQUESTED",
  BOOKING_REQUEST_DECLINED = "BOOKING_REQUEST_DECLINED",
  BOOKING_REQUEST_WITHDRAWN = "BOOKING_REQUEST_WITHDRAWN",
}

interface DateRange {
  date: string;
  timestamp: {
    start_date_time: Date;
    end_date_time: Date;
  };
  from: string;
  to: string;
}

export enum cateringOptionsName {
  BREAKFAST = "Breakfast",
  DINNER = "Dinner",
  TEA_COFFEE = "Tea & Coffee Break",
  DRINKS_RECEPTION = "Drinks reception",
  LUNCH = "Lunch",
  OTHER = "Other",
}

interface cateringOptions {
  name: cateringOptionsName;
  value: boolean;
}
export type TEnquiries = {
  _id?: ObjectId;
  date: DateRange;
  type: string;
  guests: number;
  value: number;
  space: ObjectId;
  venue: ObjectId;
  organization: ObjectId;
  own_catering?: Boolean;
  require_catering?: Boolean;
  flexible_time?: boolean;
  catering_options?: cateringOptions[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  user?: ObjectId;
  status?: enquiry_status;
  inbox: ObjectId;
};

export type TEnquiriesUpdateOptions = {
  _id?: ObjectId;
  date?: DateRange;
  type?: string;
  guests?: number;
  value?: number;
  space?: ObjectId;
  venue?: ObjectId;
  organization?: ObjectId;
  own_catering?: Boolean;
  require_catering?: Boolean;
  flexible_time?: boolean;
  catering_options?: cateringOptions[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  user?: ObjectId;
  status?: enquiry_status;
  inbox?: ObjectId;
};

export class MEnquiries implements Partial<TEnquiries> {
  _id?: ObjectId;
  date: DateRange;
  type: string;
  guests: number;
  value: number;
  space: ObjectId;
  venue: ObjectId;
  organization: ObjectId;
  own_catering?: Boolean;
  require_catering?: Boolean;
  flexible_time?: boolean;
  catering_options?: cateringOptions[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  user?: ObjectId;
  status?: enquiry_status;
  inbox: ObjectId;

  constructor(
    {
      _id = new ObjectId(),
      date = {
        date: "",
        timestamp: {
          start_date_time: new Date(),
          end_date_time: new Date(),
        },
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      },
      type = "",
      guests = 0,
      value = 0,
      space,
      venue,
      organization,
      own_catering,
      require_catering,
      flexible_time,
      catering_options,
      createdAt = new Date(),
      user = new ObjectId(),
      updatedAt,
      deletedAt,
      deletedBy,
      status = enquiry_status.NEW,
      inbox,
    }: TEnquiries = {} as TEnquiries,
  ) {
    this._id = _id;
    this.date = date;
    this.type = type;
    this.guests = guests;
    this.value = value;
    this.space = space;
    this.venue = venue;
    this.organization = organization;
    this.own_catering = own_catering;
    this.require_catering = require_catering;
    this.flexible_time = flexible_time;
    this.catering_options = catering_options;
    this.user = user;
    this.status = status;
    this.inbox = inbox;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }

  markAsDeleted(deletedBy: ObjectId) {
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
  }
}

export function formatDate(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0"); // Adding 1 because month is zero-based
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${month}-${year}`;
}
