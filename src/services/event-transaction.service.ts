import EventTransactionRepo from "../repositories/event-transaction.repository";
import { TransactionStatus } from "@prisma/client";

export default class EventTransactionSvc {
  static async getProviderDashboard(providerId: string) {
    const [assets, services, venues] = await Promise.all([
      EventTransactionRepo.findAssetTransactionsByProvider(providerId),
      EventTransactionRepo.findServiceTransactionsByProvider(providerId),
      EventTransactionRepo.findVenueTransactionsByProvider(providerId),
    ]);

    return {
      assets,
      services,
      venues,
      summary: {
        totalPending: 
          assets.filter(a => a.status === TransactionStatus.pending).length +
          services.filter(s => s.status === TransactionStatus.pending).length +
          venues.filter(v => v.status === TransactionStatus.pending).length,
        totalApproved:
          assets.filter(a => a.status === TransactionStatus.approved).length +
          services.filter(s => s.status === TransactionStatus.approved).length +
          venues.filter(v => v.status === TransactionStatus.approved).length,
      }
    };
  }

  static async reviewItem(id: string, type: "asset" | "service" | "venue", status: TransactionStatus) {
    switch (type) {
      case "asset":
        return EventTransactionRepo.updateAssetStatus(id, status);
      case "service":
        return EventTransactionRepo.updateServiceStatus(id, status);
      case "venue":
        return EventTransactionRepo.updateVenueStatus(id, status);
      default:
        throw new Error("Invalid transaction type");
    }
  }
}
