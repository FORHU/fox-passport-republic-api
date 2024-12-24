import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import KeywordSvc from "../services/keyword.service";
import { validateCreateKeywordsSchema, validateGetKeywordsSchema, validateUpdateKeywordsSchema } from "../utils/keywords/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class KeywordCtrl {
  static async createKeywords(req: Request, res: Response) {
    const { keywords } = req.body;
    const { error } = validateCreateKeywordsSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_FAILED" });
    }

    try {
      const result = await KeywordSvc.createKeywords(keywords);
      return handleResponse(res, result, "KEYWORDS_ADDED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "KEYWORDS_NOT_ADDED" });
    }
  }

  static async getKeywords(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, category = null } = req.query;

      const { error } = validateGetKeywordsSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const pageNumber = parseInt(page.toString());
      const limitNumber = parseInt(limit.toString());
      const offset = (pageNumber - 1) * limitNumber;

      const query: any = {};
      if (category) {
        query.category = category;
      }

      const totalCount = await KeywordSvc.getTotalCountKeywords(query);
      const keywords = await KeywordSvc.getKeywords(query, offset, limitNumber);

      const result = {
        data: keywords,
        total_pages: Math.ceil(totalCount / limitNumber) || 0,
        total_items: totalCount,
        current_page: page,
        size: limitNumber,
        offset,
      };
      return handleResponse(res, result, "KEYWORDS_FETCHED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "KEYWORDS_FETCH_FAILED" });
    }
  }

  static async updateKeywords(req: Request, res: Response) {
    const { keywords } = req.body;

    const { error } = validateUpdateKeywordsSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_FIELDS" });
    }
    try {
      const updatedKeywords = keywords.map((kw: any) => ({
        ...kw,
        keyword_id: new ObjectId(kw.keyword_id),
      }));
      const result = await KeywordSvc.updateKeywords(updatedKeywords);
      return handleResponse(res, result, "KEYWORDS_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "KEYWORDS_UPDATE_FAILED" });
    }
  }
}
