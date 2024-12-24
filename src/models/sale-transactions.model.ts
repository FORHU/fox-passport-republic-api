/* eslint-disable no-unused-vars */
import { Document, ObjectId } from "mongodb";

export enum SaleTransactionsStatus {
  PENDING = "pending",
  APPROVED = "owner_approved",
  OWNER_DECLINED = "owner_declined",
  OWNER_REQUEST_DELETION = "owner_request_deletion",
  SENT_REQUEST_TRANSFER_OWNERSHIP = "sent_request_transfer_ownership",
  TRANSFERRED_OWNERSHIP = "transferred_ownership",
}

export type TSaleTransactions = {
  _id?: ObjectId;
  user?: ObjectId; //sales role
  venue_owner?: ObjectId;
  venue?: ObjectId;
  remarks?: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: Date; // member role
};

export interface TUpdateSaleTransactions extends Document {
  _id?: ObjectId;
  user?: ObjectId; //sales role
  remarks?: string;
  venue?: ObjectId;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: Date; // member role
}

export class MSaleTransactions implements Partial<TSaleTransactions> {
  _id?: ObjectId;
  user?: ObjectId;
  venue_owner?: ObjectId;
  venue?: ObjectId;
  remarks?: string;
  status?: string;
  acl?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: Date;

  constructor(
    {
      _id = new ObjectId(),
      user,
      venue_owner,
      venue,
      remarks,
      status,
      createdAt = new Date(),
      updatedAt,
      deletedAt,
      deletedBy,
    } = {} as TSaleTransactions,
  ) {
    this._id = _id;
    this.user = user;
    this.venue_owner = venue_owner;
    this.venue = venue;
    this.remarks = remarks;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
