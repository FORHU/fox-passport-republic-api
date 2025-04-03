import { ObjectId } from "mongodb";

export interface TAnnouncementLog {
  _id?: ObjectId;
  announcement?: ObjectId;
  user?: ObjectId;
  viewed?: Boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export class MAnnouncementLog implements Partial<TAnnouncementLog> {
  _id?: ObjectId;
  announcement?: ObjectId;
  user?: ObjectId;
  viewed?: Boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor({ _id, announcement, user, viewed, createdAt, updatedAt, deletedAt, deletedBy } = {} as TAnnouncementLog) {
    this._id = _id || new ObjectId();
    this.announcement = announcement;
    this.user = user;
    this.viewed = viewed;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
