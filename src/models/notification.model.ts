import { ObjectId } from "mongodb";

export enum NotificationType {
  INQUIRY = "INQUIRY",
  BOOKING_CONFIRMED = "BOOKING_CONFIRMED",
  BOOKING_CANCELLED = "BOOKING_CANCELLED",
  CUSTOM_OFFER = "CUSTOM_OFFER",
  CUSTOM_OFFER_CANCELLED = "CUSTOM_OFFER_CANCELLED",
}

export enum metaDataKey {
  ENQUIRY_ID = "enquiry_id",
  BOOKING_ID = "booking_id",
  CUSTOM_OFFER_ID = "custom_offer_id",
}
export interface TNotifications {
  _id?: ObjectId;
  sender: ObjectId;
  receiver: ObjectId;
  type?: NotificationType;
  metadata?: {
    enquiry_id?: ObjectId;
    booking_id?: ObjectId;
    custom_offer_id?: ObjectId;
  };
  title?: string;
  body?: string;
  read?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export class MNotifications implements Partial<TNotifications> {
  _id?: ObjectId;
  sender: ObjectId;
  receiver: ObjectId;
  title?: string;
  type?: NotificationType;
  metadata?: {
    enquiry_id?: ObjectId;
    booking_id?: ObjectId;
    custom_offer_id?: ObjectId;
  };
  body?: string;
  read?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor(
    {
      _id = new ObjectId(),
      sender,
      receiver,
      metadata,
      type,
      title,
      body,
      read,
      createdAt = new Date(),
      updatedAt,
      deletedAt,
      deletedBy,
    }: TNotifications = {} as TNotifications,
  ) {
    this._id = _id;
    this.sender = sender;
    this.receiver = receiver;
    this.metadata = metadata;
    this.title = title;
    this.type = type;
    this.body = body;
    this.read = read;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
