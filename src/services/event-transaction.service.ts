import EventTransactionRepo from "../repositories/event-transaction.repository";
import EventRequestRepo from "../repositories/event-request.repository";
import EventTemplateRepo from "../repositories/event-template.repository";
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

  static async createTransactionsFromTemplate(eventId: string, bookingId: string) {
    const event = await EventRequestRepo.findById(eventId);
    if (!event) throw new Error("Event not found");

    const template = await EventTemplateRepo.findTemplateById(event.templateId);
    if (!template) throw new Error("Template not found");

    const creations = [];

    // Assets
    for (const item of template.templateAssets) {
      if (item.asset) {
        creations.push(EventTransactionRepo.createAssetTransaction({
          eventId,
          bookingId,
          assetId: item.assetId!,
          providerId: item.asset.ownerId,
          quantity: item.quantity,
          agreedPrice: item.asset.price * item.quantity,
          currency: item.currency,
        }));
      }
    }

    // Services
    for (const item of template.templateServices) {
      if (item.service) {
        creations.push(EventTransactionRepo.createServiceTransaction({
          eventId,
          bookingId,
          serviceId: item.serviceId!,
          providerId: item.service.ownerId,
          agreedPrice: item.service.price,
          currency: item.currency,
        }));
      }
    }

    // Venues
    for (const item of template.templateVenues) {
      if (item.venue) {
        creations.push(EventTransactionRepo.createVenueTransaction({
          eventId,
          bookingId,
          venueId: item.venueId!,
          providerId: item.venue.mayorId,
          agreedPrice: item.venue.price,
          currency: item.currency,
        }));
      }
    }

    return Promise.all(creations);
  }

  static async reviewItem(id: string, type: "asset" | "service" | "venue", status: TransactionStatus, agreedPrice?: number, providerId?: string) {
    switch (type) {
      case "asset":
        return EventTransactionRepo.updateAssetStatus(id, status, agreedPrice, providerId);
      case "service":
        return EventTransactionRepo.updateServiceStatus(id, status, agreedPrice, providerId);
      case "venue":
        return EventTransactionRepo.updateVenueStatus(id, status, agreedPrice, providerId);
      default:
        throw new Error("Invalid transaction type");
    }
  }
}
