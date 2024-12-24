import { ObjectId } from "mongodb";

export interface TCustomFacilities {
  _id?: ObjectId;
  space?: ObjectId;
  custom_facilities?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TUpdateCustomFacilities extends TCustomFacilities {}

export class MCustomFacilities implements Partial<TCustomFacilities> {
  _id?: ObjectId;
  space: ObjectId;
  custom_facilities?: string[];
  createdAt?: Date;
  updatedAt?: Date;

  constructor({
    _id = new ObjectId(),
    space = new ObjectId(),
    custom_facilities,
    createdAt = new Date(),
    updatedAt = new Date(),
  }: Partial<TCustomFacilities> = {}) {
    this._id = _id;
    this.space = space;
    this.custom_facilities = custom_facilities;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
