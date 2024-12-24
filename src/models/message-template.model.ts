import { ObjectId } from "mongodb";

export interface TMessageTemplate {
  _id?: ObjectId;
  user?: ObjectId;
  space?: ObjectId;
  message_title?: string;
  message: string;
  attachments?: ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export class MMessageTemplate implements Partial<TMessageTemplate> {
  _id?: ObjectId;
  user?: ObjectId;
  space?: ObjectId;
  message_title?: string;
  message: string;
  attachments?: ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor({
    _id = new ObjectId(),
    user,
    space,
    message,
    message_title,
    attachments,
    createdAt = new Date(),
    updatedAt,
    deletedAt,
    deletedBy,
  }: TMessageTemplate) {
    this._id = _id;
    this.user = user;
    this.space = space;
    this.message_title = message_title;
    this.message = message;
    this.attachments = attachments;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }

  markAsDeleted() {
    this.updatedAt = new Date();
  }
}
