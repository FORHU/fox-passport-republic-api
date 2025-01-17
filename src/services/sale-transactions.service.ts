import { Filter,ObjectId } from "mongodb";

import { TSaleTransactions, TUpdateSaleTransactions } from "../models/sale-transactions.model";
import SaleTransRepo from "../repositories/sale-transactions.repository";

export default class SaleTransactionSvc {
  static createSaleTransaction(data: TUpdateSaleTransactions) {
    return SaleTransRepo.createSaleTransaction(data);
  }

  static async createOrUpdateSaleTransaction(data: Partial<TUpdateSaleTransactions>[], salesId: ObjectId) {
    const salesTransactions = await SaleTransRepo.getUnpaginatedSalesTransactions({ user: salesId, status: "pending" });

    if (!salesTransactions) return SaleTransRepo.createOrUpdateSaleTransaction(data);

    const currentAssignedVenues = salesTransactions.map((item) => item.venue.toString());

    const newAssignedVenues = data.map((item) => item.venue.toString());
    const venuesToDelete = currentAssignedVenues.filter((venueId) => !newAssignedVenues.includes(venueId));

    for (const venueId of venuesToDelete) {
      await SaleTransRepo.deleteAssignedVenue({
        user: salesId,
        venue: new ObjectId(venueId as string),
        status: "pending",
      });
    }

    return SaleTransRepo.createOrUpdateSaleTransaction(data);
  }

  static updateSaleTransaction(filter: Partial<TUpdateSaleTransactions>, data: Partial<TUpdateSaleTransactions>) {
    return SaleTransRepo.updateSaleTransaction(filter, data);
  }

  static async countSalesTransaction(query: TSaleTransactions) {
    return SaleTransRepo.countSalesTransaction(query);
  }

  static async getSalesTransactions(query: Filter<TSaleTransactions>, skip: number, limit: number) {
    return SaleTransRepo.getSalesTransactions(query, skip, limit);
  }
}
