import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import MessageSvc from "../services/message.services";
import { validateGetMessages } from "../utils/message-inbox/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class MessageCtrl {
  static async getMessages(req: Request, res: Response) {
    try {
      const { id, inbox_id, room_id, page = 1, limit = 10 } = req.query as any;

      const { error } = validateGetMessages(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const pageNumber = parseInt(page.toString());
      const limitNumber = parseInt(limit.toString());
      const offset = (pageNumber - 1) * limitNumber;

      const query: any = {
        ...(id && { _id: new ObjectId(id) }),
        ...(inbox_id && { inbox: new ObjectId(inbox_id) }),
        ...(room_id && { room_id }),
        deletedAt: { $eq: null },
      };

      const list_count = await MessageSvc.getTotalCountMessage(query);
      const list = await MessageSvc.getMessages(query, offset, limitNumber);

      const result = {
        data: list,
        total_pages: Math.ceil(list_count / limitNumber) || 0,
        total_items: list_count,
        current_page: page,
        size: limitNumber,
        offset,
      };

      return handleResponse(res, result, "ENQUIRIES_FETCHED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "ENQUIRIES_FETCH_FAILED" });
    }
  }
}
