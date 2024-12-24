/* eslint-disable no-unused-vars */
import crypto from "crypto";
import { ObjectId } from "mongodb";

import { user_role, user_status } from "./user.model";

export enum user_role_status {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING",
}

export type TUserRoles = {
  _id?: ObjectId;
  user?: ObjectId;
  role?: user_role;
  password?: string;
  status?: user_status;
  organization?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MUserRoles implements Partial<TUserRoles> {
  _id?: ObjectId;
  user?: ObjectId;
  role?: user_role;
  password?: string;
  status?: user_status;
  organization?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({
    _id = new ObjectId(),
    user,
    role,
    status = user_status.PENDING,
    password,
    organization,
    createdAt = new Date(),
    updatedAt = new Date(),
  }: Partial<TUserRoles> = {}) {
    this._id = _id;
    this.user = user;
    this.role = role;
    this.status = status;
    this.password = password;
    this.organization = organization;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
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
}
