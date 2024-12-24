/* eslint-disable no-unused-vars */
import { ObjectId } from "mongodb";

export enum StatusType {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
}

export enum OrgRoles {
  VENUE_OWNER = 1, //venue owner
  ADMIN = 2, // Same access with the venue owner that invite them.
  EVENT_MANAGER = 3, // All inquiries access, all availability calendar access, all team member access, all venue management access except delete.
  MEMBER = 4, // All inquiries access, all availability calendar access, read only in team member, read only in venue management.
}

export enum suspensionDuration {
  FOR_1_HOUR = "1",
  FOR_6_HOURS = "6",
  FOR_12_HOURS = "12",
  FOR_1_DAY = "24",
  UNTIL_UNSUSPENDED = "UNTIL_UNSUSPENDED",
  REMOVE_SUSPENSION = "REMOVE_SUSPENSION",
}

export interface TOrganizationMember {
  _id?: ObjectId;
  organization?: ObjectId;
  invited_user_id?: ObjectId | null;
  venues?: ObjectId[];
  all_venues?: boolean;
  is_owner?: boolean;
  assigned_roles?: OrgRoles[];
  inviter_user_id?: ObjectId;
  status?: StatusType | null;
  suspension_time?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
}

export interface TUpdateOrganizationMember {
  _id?: ObjectId;
  venues?: ObjectId[];
  all_venues?: boolean;
  is_owner?: boolean;
  assigned_roles?: OrgRoles[];
  status?: StatusType | null;
  suspension_time?: Date;
  updatedAt?: Date;
}

export class MInvitedTeamMember implements Partial<TOrganizationMember> {
  _id?: ObjectId;
  organization?: ObjectId;
  invited_user_id?: ObjectId | null;
  all_venues?: boolean;
  is_owner?: boolean;
  venues?: ObjectId[];
  assigned_roles?: OrgRoles[];
  inviter_user_id?: ObjectId;
  status?: StatusType | null;
  suspension_time?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;

  constructor({
    _id = new ObjectId(),
    organization,
    invited_user_id,
    assigned_roles,
    venues,
    all_venues,
    is_owner = false,
    inviter_user_id,
    suspension_time,
    status = StatusType.PENDING,
    createdAt = new Date(),
    updatedAt = new Date(),
    deletedAt = new Date(),
    deletedBy = new ObjectId(),
  }: TOrganizationMember = {}) {
    this._id = _id;
    this.invited_user_id = invited_user_id;
    this.assigned_roles = assigned_roles;
    this.venues = venues;
    this.all_venues = all_venues;
    this.is_owner = is_owner;
    this.inviter_user_id = inviter_user_id;
    this.organization = organization;
    this.status = status;
    this.suspension_time = suspension_time;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }
}
