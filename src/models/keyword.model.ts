import { ObjectId } from "mongodb";

export enum KeywordType {
  SPACE = "SPACE",
  VENUE = "VENUE",
}

export interface TKeyword {
  _id?: ObjectId;
  keyword: string;
  categories: string[];
  type: KeywordType;
  status?: string;
}

export class MKeyword implements Partial<TKeyword> {
  _id?: ObjectId;
  keyword: string;
  categories: string[];
  status?: string;
  type: KeywordType;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;

  constructor({ _id = new ObjectId(), keyword, categories, type, status = "new" }: TKeyword) {
    this._id = _id;
    this.keyword = keyword;
    this.categories = categories;
    this.type = type;
    this.status = status;
  }

  markAsDeleted() {
    this.deletedAt = new Date();
  }
}
