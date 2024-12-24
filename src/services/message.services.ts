import { TMessage } from "../models/message.model";
import MessageRepo from "../repositories/messages.repository";

export default class MessageSvc {
  static createMessage(data: TMessage) {
    return MessageRepo.createMessage(data);
  }

  static getTotalCountMessage(query: any) {
    return MessageRepo.countMessages(query);
  }

  static getMessages(query: any, offset: number, limitNumber: number) {
    return MessageRepo.getMessages(query, offset, limitNumber);
  }

  static bulkCreateMessage(data: TMessage[]) {
    return MessageRepo.bulkCreateMessage(data);
  }
}
