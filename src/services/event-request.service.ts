import EventRequestRepo from "../repositories/event-request.repository";
import EventTemplateRepo from "../repositories/event-template.repository";

export default class EventRequestSvc {
  static async spawnRequestFromTemplate(data: {
    clientId: string;
    templateId: string;
    name: string;
    description: string;
    startAt: Date;
    endAt: Date;
    guestCount: number;
    totalAmount: number;
  }) {
    // 1. Fetch Template
    const template = await EventTemplateRepo.findTemplateById(data.templateId);
    if (!template) throw new Error("Template not found");

    // 2. Prepare Transactions
    const assetTransactions = template.templateAssets
      .filter((item) => !!item.asset)
      .map((item) => ({
        assetId: item.assetId!,
        providerId: item.asset!.ownerId,
        quantity: item.quantity,
        agreedPrice: item.asset!.price * item.quantity,
        currency: item.currency,
      }));

    const serviceTransactions = template.templateServices
      .filter((item) => !!item.service)
      .map((item) => ({
        serviceId: item.serviceId!,
        providerId: item.service!.ownerId,
        agreedPrice: item.service!.price,
        currency: item.currency,
      }));

    const venueTransactions = template.templateVenues
      .filter((item) => !!item.venue)
      .map((item) => ({
        venueId: item.venueId!,
        providerId: item.venue!.hostId,
        agreedPrice: item.venue!.price,
        currency: item.currency,
      }));

    // 3. Create EventClientRequest with Line Items
    return EventRequestRepo.create({
      client: { connect: { id: data.clientId } },
      host: { connect: { id: template.ownerId } },
      template: { connect: { id: data.templateId } },
      name: data.name,
      description: data.description,
      startAt: data.startAt,
      endAt: data.endAt,
      assetTransactions: { create: assetTransactions },
      serviceTransactions: { create: serviceTransactions },
      venueTransactions: { create: venueTransactions },
      guestCount: data.guestCount,
      totalAmount: data.totalAmount
    });
  }

  static async getMyRequests(clientId: string) {
    return EventRequestRepo.findAll({ clientId });
  }

  static async getRequestById(id: string) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");
    return request;
  }
}
