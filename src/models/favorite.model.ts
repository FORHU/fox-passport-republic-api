import { ObjectId } from "mongodb";

export interface TFavorite {
  _id?: ObjectId;
  space?: ObjectId;
  user?: ObjectId;
  marked_as_favorite: boolean;
  favorite_folder?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TUpdateFavorite {
  _id?: ObjectId;
  marked_as_favorite?: boolean;
  favorite_folder?: ObjectId;
  updatedAt?: Date;
}

export class MFavorite implements TFavorite {
  _id?: ObjectId;
  space?: ObjectId;
  user?: ObjectId;
  marked_as_favorite: boolean;
  favorite_folder?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      space,
      user,
      favorite_folder,
      marked_as_favorite = false,
      createdAt = new Date(),
      updatedAt = new Date(),
    } = {} as TFavorite,
  ) {
    this._id = _id;
    this.space = space;
    this.user = user;
    this.favorite_folder = favorite_folder;
    this.marked_as_favorite = marked_as_favorite;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
