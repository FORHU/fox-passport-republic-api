/* eslint-disable prettier/prettier */
import { ObjectId } from "mongodb";

import { TKeyword } from "../models/keyword.model";
import KeywordRepo from "../repositories/keyword.respository";

export default class KeywordSvc {
  static createKeywords(data: TKeyword[]) {
    return KeywordRepo.createKeywords(data);
  }

  static getTotalCountKeywords(query: KeywordSvc) {
    return KeywordRepo.countKeywords(query);
  }

  static getKeywords(query: KeywordSvc, skip: number, limit: number) {
    return KeywordRepo.getKeywords(query, skip, limit);
  }

  static updateKeywords(updateData: { keyword_id: ObjectId; payload: Partial<TKeyword> }[]) {
    return KeywordRepo.updateKeywords(updateData);
  }

  static createOrUpdateKeywords(data: TKeyword[]) {
    return KeywordRepo.createOrUpdateKeywords(data);
  }

  static forceUpdateKeywords(data: any, query: any) {
    return KeywordRepo.forceUpdateKeywords(data, query);
  }

  static deleteKeywords(query: any) {
    return KeywordRepo.deleteKeywords(query);
  }

  static _createCreatemany(data: any) {
    return KeywordRepo._createCreatemany(data);
  }

  static getExistingKeywords(data: any) {
    return KeywordRepo.getExistingKeywords(data);
  }

  static async handleParsingKeywords(keywords: any) {
    const parseKeywords = keywords
      ? await Promise.all(
        keywords.map(async (item: any) => {
          const existingKeyword = await this.getExistingKeywords(item);
          if (existingKeyword) {
            return {
              _id: existingKeyword._id,
              keyword: existingKeyword.keyword,
              categories: existingKeyword.categories,
              type: existingKeyword.type,
              status: "old",
            };
          } else {
            return {
              _id: item._id ? new ObjectId(item._id) : new ObjectId(),
              keyword: item.keyword,
              categories: item.categories,
              type: item.type,
              status: "new",
            };
          }
        }),
      )
      : null;
  
    const newKeywords = parseKeywords.filter((item) => item.status === "new");
    const oldKeywordIds = parseKeywords
      .filter((item) => item.status === "old")
      .map((item) => item._id);

    let keywordsIds = [...oldKeywordIds];
      
    if (oldKeywordIds.length > 0) {
      const oldKeywords: TKeyword[] = parseKeywords
        .filter((item) => item.status === "old")
      await this.createOrUpdateKeywords(oldKeywords)
    }

    if (newKeywords.length > 0) {
      const newKeywordIds = await KeywordSvc._createCreatemany(newKeywords);
      keywordsIds = [...keywordsIds, ...newKeywordIds];
    }

    return keywordsIds;
  }
}
