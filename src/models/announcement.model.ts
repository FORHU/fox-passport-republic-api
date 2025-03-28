import { ObjectId } from "mongodb";

export enum targetType {
  ALL = "ALL",
  VENUE_OWNER = "VENUE_OWNERS_ONLY",
  USERS = "USERS_ONLY",
}
export interface TAnnouncement {
  _id?: ObjectId;
  attachment?: ObjectId;
  title?: string;
  description?: string;
  active?: boolean;
  validUntil?: Date;
  target?: targetType;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export class MAnnouncement implements Partial<TAnnouncement> {
  _id?: ObjectId;
  attachment?: ObjectId;
  title?: string;
  description?: string;
  active?: boolean;
  validUntil: Date;
  target?: targetType;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor({ _id, attachment, title, description, active, validUntil, target, createdAt, updatedAt, deletedAt, deletedBy } = {} as TAnnouncement) {
    this._id = _id ?? new ObjectId();
    this.attachment = attachment;
    this.title = title;
    this.description = description;
    this.active = active ?? true;
    this.validUntil = validUntil;
    this.target = target ?? targetType.ALL;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
