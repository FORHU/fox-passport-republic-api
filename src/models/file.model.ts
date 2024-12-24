import { ObjectId } from "mongodb";

export interface TFile {
  _id?: ObjectId;
  filename: string;
  contentType: string;
  size: number;
  path: string;
  origin?: string;
  description?: string;
  uploadedBy: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UpdateFile {
  filename?: string;
  contentType?: string;
  size?: number;
  path?: string;
  origin?: string;
  description?: string;
  uploadedBy?: ObjectId;
  updatedAt?: Date;
}

export class MFile implements TFile {
  _id?: ObjectId;
  filename: string;
  contentType: string;
  size: number;
  path: string;
  origin?: string;
  description?: string;
  uploadedBy: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({
    _id = new ObjectId(),
    filename,
    contentType,
    size,
    path,
    description,
    origin,
    uploadedBy,
    createdAt = new Date(),
    updatedAt,
  }: TFile) {
    this._id = _id;
    this.filename = filename;
    this.contentType = contentType;
    this.size = size;
    this.path = path;
    this.origin = origin;
    this.description = description;
    this.uploadedBy = uploadedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
