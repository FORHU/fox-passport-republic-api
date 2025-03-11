import { ObjectId } from "mongodb";

interface DateRange {
  date?: string;
  timestamp?: Date;
  from?: string;
  to?: string;
}

export enum offer_status_title {
  OFFER_ACCEPTED = "Offer Accepted",
  DECLINED = "Offer Declined",
  CANCELLED = "Offer Cancelled",
}

export enum offer_status {
  OFFER_ACCEPTED = "OFFER_ACCEPTED",
  COMPLETED = "COMPLETED",
  PAYMENT_IN_PROGRESS = "PAYMENT_IN_PROGRESS",
  BOOKING_CONFIRMED = "BOOKING_CONFIRMED",
  BOOKING_REQUESTED = "BOOKING_REQUESTED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PENDING = "PENDING",
  ARCHIVE = "ARCHIVE",
  DECLINED = "DECLINED",
}

export interface TCustomOffer {
  _id?: ObjectId;
  user?: ObjectId;
  inbox?: ObjectId;
  venue?: ObjectId;
  space?: ObjectId;
  date?: DateRange;
  guests?: number;
  venue_computation?: {
    subtotal?: number | null;
    commision_fee?: number | null;
    grand_total?: number | null;
    cleaning_fee?: number | null;
  };
  user_computation?: {
    subtotal?: number | null;
    rebate?: number | null;
    grand_total?: number | null;
    cleaning_fee?: number | null;
  };
  status?: offer_status;
  notes?: string | null | "";
  agree_to_terms?: boolean;
  message_to_owner?: string | "" | null;
  currency?: string;
  enquiry_id?: ObjectId;
  booking?: ObjectId;
  invoice?: ObjectId;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: ObjectId | null;
}

export interface TUpdateCustomOffer {
  date?: DateRange;
  guests?: number;
  venue_computation?: {
    subtotal?: number | null;
    commision_fee?: number | null;
    grand_total?: number | null;
    cleaning_fee?: number | null;
  };
  user_computation?: {
    subtotal?: number | null;
    rebate?: number | null;
    grand_total?: number | null;
    cleaning_fee?: number | null;
  };
  status?: offer_status;
  notes?: string | null | "";
  agree_to_terms?: boolean;
  message_to_owner?: string | "" | null;
  currency?: string;
  enquiry_id?: ObjectId;
  booking?: ObjectId;
  invoice?: ObjectId;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
  deletedBy?: ObjectId | null;
}

export type TCustomOfferUpdate = TCustomOffer;

export interface TCustomOfferDelete {
  _id?: ObjectId;
  deletedBy: ObjectId;
}

export class MCustomOffer implements Partial<TCustomOffer> {
  _id?: ObjectId;
  user?: ObjectId;
  inbox?: ObjectId;
  venue?: ObjectId;
  space?: ObjectId;
  date?: DateRange;
  guests?: number;
  venue_computation?: {
    subtotal?: number | null;
    commision_fee?: number | null;
    grand_total?: number | null;
    cleaning_fee?: number | null;
  };
  user_computation?: {
    subtotal?: number | null;
    rebate?: number | null;
    grand_total?: number | null;
    cleaning_fee?: number | null;
  };
  status: offer_status;
  notes?: string | null | "";
  agree_to_terms?: boolean;
  message_to_owner?: string | "" | null;
  currency?: string;
  enquiry_id?: ObjectId;
  booking?: ObjectId;
  invoice?: ObjectId;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: ObjectId | null;

  constructor({
    _id = new ObjectId(),
    user,
    inbox,
    venue,
    space,
    date,
    guests = 0,
    status = offer_status.PENDING,
    venue_computation,
    user_computation,
    notes,
    agree_to_terms,
    message_to_owner,
    currency,
    enquiry_id,
    booking,
    invoice,
    createdAt = new Date(),
    updatedAt = null,
    deletedAt = null,
    deletedBy = null,
  }: Partial<TCustomOffer> = {}) {
    this._id = _id;
    this.user = user!;
    this.inbox = inbox!;
    this.venue = venue!;
    this.space = space!;
    this.date = date!;
    this.guests = guests;
    this.status = status;
    this.notes = notes;
    this.venue_computation = venue_computation;
    this.user_computation = user_computation;
    this.agree_to_terms = agree_to_terms;
    this.message_to_owner = message_to_owner;
    this.currency = currency;
    this.enquiry_id = enquiry_id;
    this.booking = booking;
    this.invoice = invoice;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
