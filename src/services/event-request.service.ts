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

    // 2. Create Event without transactions (will be created after confirmation)
    return EventRequestRepo.create({
      client: { connect: { id: data.clientId } },
      host: { connect: { id: template.ownerId } },
      template: { connect: { id: data.templateId } },
      name: data.name,
      description: data.description,
      eventCategory: template.category,
      startAt: data.startAt,
      endAt: data.endAt,
      guestCount: data.guestCount,
      totalAmount: data.totalAmount
    });
  }

  static async approveRequest(id: string, userId: string, systemRole: string) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");

    // Only assigned host or admin can approve
    if (request.organizerId !== userId && systemRole !== 'admin') {
      throw new Error("Unauthorized: Only the assigned host can approve this request");
    }

    return EventRequestRepo.updateRequestStatus(id, "approved");
  }

  static async completeEvent(id: string) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");
    return EventRequestRepo.updateStatus(id, "completed");
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
