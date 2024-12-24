import { ObjectId } from "mongodb";

export interface TOrganization {
  _id?: ObjectId;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export class MOrganization implements Partial<TOrganization> {
  _id?: ObjectId;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;

  constructor({ _id = new ObjectId(), name, description, updatedAt, deletedAt }: TOrganization) {
    this._id = _id;
    this.name = name;
    this.description = description;
    this.createdAt = new Date();
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
  }

  markAsDeleted() {
    this.deletedAt = new Date();
  }
}
