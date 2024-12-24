import { TInbox } from "../models/inbox.model";
import InboxRepo from "../repositories/inbox.repository";

export default class InboxSvc {
  static createInbox(data: TInbox) {
    return InboxRepo.createInbox(data);
  }

  static getInbox(query: any) {
    return InboxRepo.getInbox(query);
  }
}
