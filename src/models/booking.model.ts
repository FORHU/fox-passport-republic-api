import { ObjectId } from "mongodb";

export enum booking_status {
  CONFIRMED = "CONFIRMED",
  PENDING = "PENDING",
  CANCELLED = "CANCELLED",
  BOOKING_REQUESTED = "BOOKING_REQUESTED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
}

export enum EventDuration {
  BOOKED_PART_OF_DAY = "BOOKED_PART_OF_DAY",
  BOOKED_ALL_DAY = "BOOKED_ALL_DAY",
  BOOKED_MULTIPLE_DAYS = "BOOKED_MULTIPLE_DAYS",
}

export enum RepeatEvent {
  DOES_NOT_REPEAT = "DOES_NOT_REPEAT",
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

export enum CancellationReason {
  THE_GUEST_BOOKED_INCORRECT_TYPE = "THE_GUEST_BOOKED_INCORRECT_TYPE",
  THE_BOOKING_VIOLATES_THE_RULES_OF_MY_SPACE = "THE_BOOKING_VIOLATES_THE_RULES_OF_MY_SPACE",
  THE_GUEST_IS_UNRESPONSIVE = "THE_GUEST_IS_UNRESPONSIVE",
  MY_SPACE_IS_NO_LONGER_AVAILABLE = "MY_SPACE_IS_NO_LONGER_AVAILABLE",
  CHANGE_MY_MIND = "CHANGE_MY_MIND",
  SCHEDULING_CONFLICT = "SCHEDULING_CONFLICT",
  WEATHER_CONCERNS = "WEATHER_CONCERNS",
  EVENT_SCHEDULED = "EVENT_SCHEDULED",
  HEALTH_AND_SAFETY_CONCERNS = "HEALTH_AND_SAFETY_CONCERNS",
  OTHER = "OTHER",
}

export type TBooking = {
  _id?: ObjectId;
  booker: ObjectId; // The user who made the booking
  booked_user: ObjectId; // The user who will be booked
  enquiry: ObjectId | null;
  space: ObjectId;
  venue: ObjectId;
  reason_for_cancellation?: CancellationReason;
  message?: string;
  start_date?: any;
  end_date?: any;
  total_guest?: number;
  total_price?: number;
  status?: booking_status;
  booking_reference?: string;
  refund_data?: any;
  repeat_event?: RepeatEvent | null;
  optional_input?: {
    first_name?: string | null | "";
    last_name?: string | null | "";
    email?: string | null | "";
  };
  event_type?: string;
  event_duration?: EventDuration | null;
  createdAt?: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: ObjectId;
  deletedAt?: Date;
  deletedBy?: ObjectId;
};

export class MBooking implements Partial<TBooking> {
  _id?: ObjectId;
  booker: ObjectId;
  booked_user: ObjectId;
  enquiry: ObjectId | null;
  space: ObjectId;
  venue: ObjectId;
  reason_for_cancellation?: CancellationReason;
  message?: string;
  start_date?: Date;
  end_date?: Date;
  total_guest?: number;
  total_price?: number;
  status?: booking_status;
  booking_reference?: string;
  refund_data?: any;
  event_type?: string;
  repeat_event?: RepeatEvent | null;
  optional_input?: {
    first_name?: string | null | "";
    last_name?: string | null | "";
    email?: string | null | "";
  };
  event_duration?: EventDuration | null;
  createdAt?: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: ObjectId;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor(data: TBooking) {
    const {
      _id = new ObjectId(),
      booker,
      booked_user,
      enquiry,
      space,
      venue,
      reason_for_cancellation,
      message,
      start_date,
      end_date,
      total_guest,
      total_price,
      status = booking_status.PENDING,
      refund_data,
      booking_reference,
      event_type,
      optional_input,
      repeat_event,
      event_duration,
      createdAt = new Date(),
      updatedAt,
      cancelledAt,
      cancelledBy,
      deletedAt,
      deletedBy,
    } = data;

    this._id = _id;
    this.booker = booker;
    this.booked_user = booked_user;
    this.enquiry = enquiry;
    this.space = space;
    this.venue = venue;
    this.reason_for_cancellation = reason_for_cancellation;
    this.message = message;
    this.start_date = start_date;
    this.end_date = end_date;
    this.total_guest = total_guest;
    this.total_price = total_price;
    this.status = status;
    this.booking_reference = booking_reference;
    this.refund_data = refund_data;
    this.event_type = event_type;
    this.optional_input = optional_input;
    this.repeat_event = repeat_event;
    this.event_duration = event_duration;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.cancelledAt = cancelledAt;
    this.cancelledBy = cancelledBy;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }

  delete_booking(deleteBy: ObjectId) {
    this.deletedAt = new Date();
    this.deletedBy = deleteBy;
  }

  confirm_booking() {
    this.status = booking_status.CONFIRMED;
    this.updatedAt = new Date();
  }

  cancel_booking(cancelled_by: ObjectId) {
    this.status = booking_status.CANCELLED;
    this.cancelledAt = new Date();
    this.cancelledBy = cancelled_by;
    this.updatedAt = new Date();
  }
}
