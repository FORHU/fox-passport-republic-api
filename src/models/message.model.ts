import { ObjectId } from "mongodb";

export interface TMessage {
  _id?: ObjectId;
  inbox: ObjectId;
  room_id: string;
  sender: ObjectId;
  receiver?: ObjectId;
  content: string;
  generated_content?: any;
  key?: string;
  attachments?: ObjectId[];
  admin_generated?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export class MMessage implements TMessage {
  _id?: ObjectId;
  inbox: ObjectId;
  room_id: string;
  sender: ObjectId;
  receiver?: ObjectId;
  content: string;
  generated_content?: any;
  key?: string;
  attachments?: ObjectId[];
  admin_generated?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;

  constructor({
    _id = new ObjectId(),
    inbox,
    room_id,
    sender,
    receiver,
    content,
    generated_content,
    key = "",
    attachments,
    admin_generated = false,
    createdAt = new Date(),
    updatedAt,
    deletedAt,
  }: TMessage) {
    this._id = _id;
    this.inbox = inbox;
    this.room_id = room_id;
    this.sender = sender;
    this.receiver = receiver;
    this.content = content;
    this.generated_content = generated_content;
    this.key = key;
    this.attachments = attachments;
    this.admin_generated = admin_generated;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
  }
}
