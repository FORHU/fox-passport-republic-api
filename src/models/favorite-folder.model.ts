import { ObjectId } from "mongodb";

export interface TFavoriteFolder {
  _id?: ObjectId;
  user?: ObjectId;
  folder_name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TUpdateFavoriteFolder {
  _id?: ObjectId;
  folder_name: string;
  updatedAt?: Date;
}

export class MFavoriteFolder implements TFavoriteFolder {
  _id?: ObjectId;
  user?: ObjectId;
  folder_name: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({ _id = new ObjectId(), user = new ObjectId(), folder_name, createdAt = new Date(), updatedAt = new Date() } = {} as TFavoriteFolder) {
    this._id = _id;
    this.folder_name = folder_name;
    this.user = user;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
