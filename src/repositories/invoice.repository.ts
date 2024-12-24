import { MInvoice, TInvoice } from "../models/invoice.model";
import { getDB } from "../utils/mongo";

export default class TodoRepo {
  static collection() {
    return getDB().collection("invoices");
  }

  static async createInvoice(data: TInvoice) {
    return this.collection().insertOne(new MInvoice(data));
  }

  static async getInvoice(query: any) {
    const invoice = this.collection().findOne(query);
    return invoice;
  }
  static async updateInvoice(query: any, updateData: any) {
    return this.collection().updateOne(query, {
      $set: updateData,
    });
  }
}
