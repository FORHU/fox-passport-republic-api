import { ObjectId } from "mongodb";

export enum NotificationStatusType {
  READ = "READ",
  UNREAD = "UNREAD",
}

export enum NotificationType {
  INQUIRY = "INQUIRY",
  BOOKING_CONFIRMED = "BOOKING_CONFIRMED",
  BOOKING_CANCELLED = "BOOKING_CANCELLED",
  CUSTOM_OFFER = "CUSTOM_OFFER",
}

export enum metaDataKey {
  ENQUIRY_ID = "enquiry_id",
  BOOKING_ID = "booking_id",
  CUSTOM_OFFER_ID = "custom_offer_id"
}
export interface TNotications {
  _id?: ObjectId;
  sender: ObjectId;
  receiver: ObjectId;
  metadata?: {
    enquiry_id?: ObjectId;
    booking_id?: ObjectId;
  };
  title?: string;
  body?: string;
  status?: NotificationStatusType;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export class MNotications implements Partial<TNotications> {
  _id?: ObjectId;
  sender: ObjectId;
  receiver: ObjectId;
  title?: string;
  metadata?: {
    enquiry_id?: ObjectId;
    booking_id?: ObjectId;
  };
  body?: string;
  status?: NotificationStatusType;
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
      title,
      body,
      status,
      createdAt = new Date(),
      updatedAt,
      deletedAt,
      deletedBy,
    }: TNotications = {} as TNotications,
  ) {
    this._id = _id;
    this.sender = sender;
    this.receiver = receiver;
    this.metadata = metadata;
    this.title = title;
    this.body = body;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
