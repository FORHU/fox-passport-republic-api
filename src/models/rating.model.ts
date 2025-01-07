import { ObjectId } from "mongodb";

export enum space_rating {
  "POOR" = "POOR",
  "NEEDS_IMPROVEMENT" = "NEEDS_IMPROVEMENT",
  "GOOD" = "GOOD",
  "VERY_GOOD" = "VERY_GOOD",
  "EXCELLENT" = "EXCELLENT",
}

export interface TRating {
  _id?: ObjectId;
  user?: ObjectId;
  space?: ObjectId;
  rating: number;
  publicNote?: string;
  privateNote?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TUpdateRating extends Partial<TRating> {}

export class MRating implements Partial<TRating> {
  _id?: ObjectId;
  user?: ObjectId;
  space?: ObjectId;
  rating: number;
  publicNote?: string;
  privateNote?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({
    _id = new ObjectId(),
    user = new ObjectId(),
    space = new ObjectId(),
    rating = 0,
    publicNote,
    privateNote,
    createdAt = new Date(),
    updatedAt = new Date(),
  }: Partial<TRating> = {}) {
    this._id = _id;
    this.user = user;
    this.space = space;
    this.rating = rating;
    this.publicNote = publicNote;
    this.privateNote = privateNote;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
