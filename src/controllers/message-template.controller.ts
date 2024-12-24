import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import MessageTemplateService from "../services/message-template.service";
import { validateCreateMessageTemplate, validateGetMessageTemplate, validateUpdateMessageTemplate } from "../utils/message-template/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class MessageTemplateCtrl {
  static async createMessageTemplate(req: Request, res: Response) {
    try {
      const { space_id, message_title, message, attachments } = req.body;
      const userId = new ObjectId(req.user._id);
      const spaceId = new ObjectId(space_id);

      const { error } = validateCreateMessageTemplate(req.body);
      if (error) {
        handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const attachmentIds = attachments ? attachments.map((id: string) => new ObjectId(id)) : [];

      const data = {
        user: userId,
        space: spaceId,
        message_title: message_title,
        message: message,
        attachments: attachmentIds,
      };

      const result = await MessageTemplateService.createMessageTemplate(data);
      return handleResponse(res, result, "MESSAGE_TEMPLATE_CREATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "MESSAGE_TEMPLATE_CREATE_FAILED" });
    }
  }

  static async getMessageTemplate(req: Request, res: Response) {
    try {
      const { _id, space_id }: any = req.query;

      const { error } = validateGetMessageTemplate(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const query: any = {
        ...(_id && { _id: new ObjectId(_id) }),
        ...(space_id && { space: new ObjectId(space_id) }),
        deletedAt: { $eq: null },
      };

      const result = await MessageTemplateService.getMessageTemplate(query);
      return handleResponse(res, result, "MESSAGE_TEMPLATE_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "MESSAGE_TEMPLATE_FETCH_FAILED" });
    }
  }

  static async updateMessageTemplate(req: Request, res: Response) {
    try {
      const _id = new ObjectId(req.params.id);
      const { message_title, message, attachments } = req.body;

      const [existingData]: any = await MessageTemplateService.getMessageTemplate({ _id: _id });
      if (!existingData) {
        return handleErrorResponse(res, {}, { code: "MESSAGE_TEMPLATE_NOT_FOUND" });
      }

      const { error } = validateUpdateMessageTemplate(req.body);
      if (error) {
        handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const attachmentIds = attachments ? attachments.map((id: string) => new ObjectId(id)) : [];

      const updated_data = {
        message_title: message_title,
        message: message,
        attachments: attachmentIds,
        updatedAt: new Date(),
      };

      const result = await MessageTemplateService.updateMessageTemplate(_id, updated_data);
      return handleResponse(res, result, "MESSAGE_TEMPLATE_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "MESSAGE_TEMPLATE_UPDATE_FAILED" });
    }
  }

  static async deleteMessageTemplate(req: Request, res: Response) {
    try {
      const _id = new ObjectId(req.params.id);

      const [existingData]: any = await MessageTemplateService.getMessageTemplate({ _id: _id });
      if (!existingData) {
        return handleErrorResponse(res, {}, { code: "MESSAGE_TEMPLATE_NOT_FOUND" });
      }

      const data = {
        deletedAt: new Date(),
        deletedBy: new ObjectId(req.user._id),
      };

      const result = await MessageTemplateService.updateMessageTemplate(_id, data);
      return handleResponse(res, result, "MESSAGE_TEMPLATE_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "MESSAGE_TEMPLATE_DELETE_FAILED" });
    }
  }
}
