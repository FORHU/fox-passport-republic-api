import { ObjectId } from "mongodb";

export interface TInbox {
  _id?: ObjectId;
  room_id: string;
  sender: ObjectId;
  receiver?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export interface TMessage {
  _id?: ObjectId;
  room_id: string;
  sender: ObjectId;
  receiver?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export class MInbox implements TInbox {
  _id?: ObjectId;
  room_id: string;
  sender: ObjectId;
  receiver?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;

  constructor({ _id = new ObjectId(), room_id, sender, receiver, createdAt = new Date(), updatedAt, deletedAt }: TInbox) {
    this._id = _id;
    this.room_id = room_id;
    this.sender = sender;
    this.receiver = receiver;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
  }
}
