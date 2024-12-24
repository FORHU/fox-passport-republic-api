import { ObjectId } from "mongodb";

export type TEmailLogs = {
  _id?: ObjectId;
  user_id?: ObjectId;
  email_type?: string;
  venue_id?: ObjectId;
  status?: string;
  sentAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
  deletedAt?: Date;
};

export class MEmailLogs implements Partial<TEmailLogs> {
  _id?: ObjectId;
  user_id?: ObjectId;
  email_type?: string;
  venue_id?: ObjectId;
  status?: string;
  sentAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
  deletedAt?: Date;

  constructor({
    _id = new ObjectId(),
    user_id,
    email_type = "",
    status,
    sentAt,
    venue_id,
    createdAt = new Date(),
    updatedAt = new Date(),
    deletedAt,
  }: Partial<TEmailLogs> = {}) {
    this._id = _id;
    this.user_id = user_id;
    this.email_type = email_type;
    this.status = status;
    this.sentAt = sentAt;
    this.venue_id = venue_id;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
  }
}
