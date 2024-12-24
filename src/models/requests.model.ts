import { ObjectId } from "mongodb";

export enum RequestStatus {
  DEACTIVATION_REQUEST = "DEACTIVATION_REQUEST",
  DELETION_REQUEST = "DELETION_REQUEST",
  DELETED = "DELETED",
  BOOKING_REQUEST = "BOOKING_REQUEST",
  UPDATING_REQUEST = "UPDATING_REQUEST",
  COMPLETED = "COMPLETED",
}

export enum RequestType {
  USER = "USER",
  VENUE = "VENUE",
  SPACE = "SPACE",
  ENQUIRY = "ENQUIRY",
  CUSTOM_OFFER = "CUSTOM_OFFER",
  BOOKING = "BOOKING",
}

export type TRequests = {
  _id: ObjectId;
  type?: RequestType;
  description?: string;
  user?: ObjectId;
  venue?: ObjectId;
  space?: ObjectId;
  enquiry?: ObjectId;
  custom_offer?: ObjectId;
  booking?: ObjectId;
  request_data?: any;
  status?: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  deletedBy: ObjectId;
};

export class MRequests implements Partial<TRequests> {
  _id?: ObjectId;
  type?: RequestType;
  description?: string;
  user?: ObjectId;
  venue?: ObjectId;
  space?: ObjectId;
  enquiry?: ObjectId;
  custom_offer?: ObjectId;
  booking?: ObjectId;
  request_data?: any;
  status?: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  deletedBy: ObjectId;

  constructor({
    _id,
    type,
    description,
    user,
    venue,
    space,
    enquiry,
    custom_offer,
    booking,
    request_data,
    status,
    createdAt,
    updatedAt,
    deletedAt,
    deletedBy,
  }: TRequests) {
    this._id = _id;
    this.type = type;
    this.description = description;
    this.user = user;
    this.venue = venue;
    this.space = space;
    this.enquiry = enquiry;
    this.custom_offer = custom_offer;
    this.booking = booking;
    this.request_data = request_data;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
