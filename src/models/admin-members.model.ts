/* eslint-disable no-unused-vars */
import { ObjectId } from "mongodb";

export enum AdminMemberRoles {
  ADMIN = 1, // can create, update, read, delete documents from venues collection. can read documents from venue-transaction collection, can add or remove members
  SALES = 2, // can update, read, documents from venue-transaction collection. read only for venues collection. can't add or remove members
  MEMBER = 3, // same with admin. can't add or remove members
  SUPER_ADMIN = 4,
}

export type TAdminMembers = {
  _id?: ObjectId;
  admin?: ObjectId;
  invited_user?: ObjectId; // member id
  assigned_roles?: number; // assigned_role of member
  acl?: any[];
  status?: string;
  venues?: ObjectId[];
  suspension_time?: Date | string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
};

export class MAdminMembers implements Partial<TAdminMembers> {
  _id?: ObjectId;
  admin?: ObjectId;
  invited_user?: ObjectId;
  assigned_roles?: number;
  acl?: any[];
  status?: string;
  venues: ObjectId[];
  suspension_time?: Date | string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor(
    {
      _id,
      admin,
      invited_user,
      assigned_roles,
      acl,
      status,
      suspension_time,
      venues,
      createdAt,
      updatedAt,
      deletedAt,
      deletedBy,
    } = {} as TAdminMembers,
  ) {
    this._id = _id;
    this.admin = admin;
    this.invited_user = invited_user;
    this.assigned_roles = assigned_roles;
    this.acl = acl;
    this.status = status;
    this.suspension_time = suspension_time;
    this.venues = venues;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
