import { ObjectId } from "mongodb";
import MessageTemplateRepo from "../repositories/message-template.repository";
import { TMessageTemplate } from "../models/message-template.model";

export default class MessageTemplateService {
  static async createMessageTemplate(data: TMessageTemplate) {
    const result = await MessageTemplateRepo.createMessageTemplate(data);
    return result;
  }

  static async getMessageTemplate(query: any) {
    const result = await MessageTemplateRepo.getMessageTemplate(query);
    return result;
  }

  static async updateMessageTemplate(message_template_id: ObjectId, data: any) {
    const result = await MessageTemplateRepo.updateMessageTemplate(message_template_id, data);
    return result;
  }
}
