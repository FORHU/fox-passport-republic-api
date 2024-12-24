import { MInbox, TInbox } from "../models/inbox.model";
import { getDB } from "../utils/mongo";

export default class InboxRepo {
  static collection() {
    return getDB().collection("inboxes");
  }

  static async createInbox(data: TInbox) {
    return this.collection().insertOne(new MInbox(data));
  }

  static async getInbox(query: any) {
    const inbox = await this.collection().findOne(query);
    if (inbox) {
      return inbox as TInbox;
    } else {
      return null;
    }
  }
}
