import { MReceipt, TReceipt } from "../models/receipt.model";
import { getDB } from "../utils/mongo";

export default class ReceiptRepo {
  static collection() {
    return getDB().collection("receipts");
  }

  static async createReceipt(data: TReceipt) {
    const result = await this.collection().insertOne(new MReceipt(data));
    const newReceipt = await this.collection().findOne({ _id: result.insertedId });
    return newReceipt;
  }

  static async getReceipt(query: any) {
    const invoice = this.collection().findOne(query);
    return invoice;
  }
}
