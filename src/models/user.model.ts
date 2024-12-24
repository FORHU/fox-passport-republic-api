/* eslint-disable no-unused-vars */
import crypto from "crypto";
import { ObjectId } from "mongodb";

export enum user_role {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  USER = "USER",
  VENUE_OWNER = "VENUE_OWNER",
  VENUE_LISTER = "VENUE_LISTER",
  EVENT_MANAGER = "EVENT_MANAGER",
  FINANCE_AND_ACCOUNTING = "FINANCE_AND_ACCOUNTING",
}

export enum user_status {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING",
}
enum user_origin {
  FACEBOOK = "FACEBOOK",
  GOOGLE = "GOOGLE",
  EMAIL = "EMAIL",
}

export interface user_otp {
  otp_code: number;
  otp_expiration: Date;
}

export type TUser = {
  _id?: ObjectId;
  first_name?: string;
  last_name?: string;
  profile_picture?: ObjectId;
  phone_number?: string;
  date_of_birth?: string;
  origin?: user_origin;
  company_name?: string;
  country?: string;
  zip_code?: string;
  postal?: string;
  email?: string;
  password?: string;
  username?: string;
  social_link?: string;
  role?: user_role;
  organization?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  status?: user_status;
  user_roles?: ObjectId[];
  otp?: user_otp;
};

export type TUserUpdateOptions = {
  _id?: ObjectId | string;
  first_name?: string;
  last_name?: string;
  profile_picture?: ObjectId;
  phone_number?: string;
  date_of_birth?: string;
  origin?: user_origin;
  company_name?: string;
  country?: string;
  zip_code?: string;
  postal?: string;
  email?: string;
  password?: string;
  username?: string;
  social_link?: string;
  role?: user_role;
  organization?: ObjectId;
  user_roles?: ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  status?: user_status;
  otp?: user_otp;
};

export class MUser implements Partial<TUser> {
  _id?: ObjectId;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string;
  profile_picture?: ObjectId;
  origin?: user_origin;
  company_name?: string;
  country?: string;
  zip_code?: string;
  postal?: string;
  email?: string;
  password: string;
  username?: string;
  social_link?: string;
  role?: user_role;
  organization?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: ObjectId;
  status?: user_status;
  otp?: user_otp;
  user_roles?: ObjectId[];

  constructor({
    _id = new ObjectId(),
    username,
    first_name,
    last_name,
    phone_number,
    date_of_birth,
    profile_picture,
    origin = user_origin.EMAIL,
    company_name,
    country,
    zip_code,
    postal,
    email = "",
    password = "",
    role = user_role.USER,
    social_link = "",
    status = user_status.PENDING,
    otp,
    user_roles = [],
    organization,
    createdAt = new Date(),
    updatedAt,
    deletedAt,
    deletedBy,
  }: Partial<TUser> = {}) {
    this._id = _id;
    this.first_name = first_name;
    this.last_name = last_name;
    this.phone_number = phone_number;
    this.date_of_birth = date_of_birth;
    this.profile_picture = profile_picture;
    this.origin = origin;
    this.company_name = company_name;
    this.country = country;
    this.zip_code = zip_code;
    this.email = email;
    this.username = username;
    this.password = password;
    this.role = role;
    this.user_roles = user_roles;
    this.status = status;
    this.otp = otp;
    this.organization = organization;
    this.social_link = social_link;
    this.postal = postal;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy;
  }

  hashPassword(password: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(password);
    return hash.digest("hex");
  }

  async save() {
    this.password = this.hashPassword(this.password);
  }

  async comparePassword(password: string): Promise<boolean> {
    const hash = crypto.createHash("sha256");
    hash.update(password);
    const hashedPassword = hash.digest("hex");
    return this.password === hashedPassword;
  }

  markAsDeleted(deletedBy: ObjectId) {
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
  }
}

export function hashPassword(password: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(password);
  return hash.digest("hex");
}
