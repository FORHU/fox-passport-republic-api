import { ObjectId } from "mongodb";

import { MFile, TFile } from "../models/file.model";
import { getDB } from "../utils/mongo";

export default class KeywordRepo {
  static collection() {
    return getDB().collection("files");
  }

  static async handleGetFiles(query: any) {
    return await this.collection().find(query).toArray();
  }

  static async getFileById(id: ObjectId) {
    return await this.collection().findOne({ _id: id });
  }

  static async createFiles(data: TFile) {
    const fileInstance = new MFile(data);
    await this.collection().insertOne(fileInstance);
    return fileInstance;
  }

  static async getFiles(ids: any) {
    return await this.collection()
      .find({ _id: { $in: ids } })
      .toArray();
  }

  static async getFilesLocation(query: any, offset: number, limit: number) {
    return await this.collection().find(query).skip(offset).limit(limit).toArray();
  }

  static async countFiles(query: any) {
    return await this.collection().countDocuments(query);
  }

  static async updateFiles(query: Partial<TFile>, data: any) {
    return await this.collection().updateOne(query, { $set: data });
  }

  static async deleteFilesById(_id: ObjectId) {
    return await this.collection().deleteOne({ _id });
  }
}
