import { EventCategory } from "@prisma/client";
import { toEnum } from "../../utils/enums";
import EventRequestRepo from "./event-request.repository";
import EventTemplateRepo from "../event-template/event-template.repository";
import EventTemplateSvc from "../event-template/event-template.service";
import { can } from "../../types/permissions";
import { sendApprovedEmail } from "../../utils/emails/approved";
import { sendRejectedEmail } from "../../utils/emails/rejected";

export default class EventRequestSvc {
  static async createDirectEvent(data: {
    clientId: string;
    name: string;
    description: string;
    eventCategory: string;
    startAt: Date;
    endAt: Date;
    guestCount: number;
    totalAmount?: number;
    currency?: string;
  }) {
    const eventCategory = toEnum(EventCategory, data.eventCategory);
    if (!eventCategory) throw new Error("Invalid event category");

    return EventRequestRepo.create({
      client: { connect: { id: data.clientId } },
      host: { connect: { id: data.clientId } },
      name: data.name,
      description: data.description,
      eventCategory,
      startAt: data.startAt,
      endAt: data.endAt,
      guestCount: data.guestCount,
      totalAmount: data.totalAmount ?? 0,
      requestStatus: "approved",
    });
  }

  static async spawnRequestFromTemplate(data: {
    clientId: string;
    templateId: string;
    name: string;
    description: string;
    startAt: Date;
    endAt: Date;
    guestCount: number;
    totalAmount?: number;
  }) {
    // 1. Fetch Template
    const template = await EventTemplateRepo.findTemplateById(data.templateId);
    if (!template) throw new Error("Template not found");

    const templateTotals = EventTemplateSvc.calculateTotalsBreakdown(template);
    const hasTemplateItems =
      (template.templateAssets?.length ?? 0) > 0 ||
      (template.templateServices?.length ?? 0) > 0 ||
      (template.templateVenues?.length ?? 0) > 0;

    const totalAmount = hasTemplateItems
      ? templateTotals.totalAmount
      : (data.totalAmount ?? 0);
    const itemsTotal = hasTemplateItems ? templateTotals.itemsTotal : 0;
    const hostMarkupAmount = hasTemplateItems
      ? templateTotals.hostMarkupAmount
      : 0;
    const platformFeeAmount = hasTemplateItems
      ? templateTotals.platformFeeAmount
      : 0;

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
      totalAmount,
      itemsTotal,
      hostMarkupAmount,
      platformFeeAmount,
      targetCity: template.targetCity ?? undefined,
      targetState: template.targetState ?? undefined,
      targetCountry: template.targetCountry ?? undefined,
    });
  }

  static async approveRequest(id: string, userId: string, systemRole: string) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");

    // Only assigned host or admin can approve
    if (request.organizerId !== userId && !can(systemRole, "queue:read")) {
      throw new Error(
        "Unauthorized: Only the assigned host can approve this request",
      );
    }

    const updated = await EventRequestRepo.updateRequestStatus(id, "approved");

    // The decision email was sent from the controller, which re-fetched the
    // event to find the host's address - a second query for a row this method
    // has already loaded. Fire-and-forget: a mail provider having a bad minute
    // must not fail an approval that is already committed.
    if (request.host?.email) {
      try {
        sendApprovedEmail({
          to: request.host.email,
          entityName: request.name,
          entityType: "Event",
        });
      } catch (emailErr) {
        console.error("Failed to send approval email:", emailErr);
      }
    }

    return updated;
  }

  static async rejectRequest(
    id: string,
    reason: string | undefined,
    userId: string,
    systemRole: string,
  ) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");
    if (!can(systemRole, "queue:decide"))
      throw new Error("Unauthorized: Only admins can reject requests");

    const updated = await EventRequestRepo.rejectRequest(id, reason);

    // Only with a reason, as the controller had it: a rejection email with no
    // reason in it is worse than none.
    if (request.host?.email && reason) {
      try {
        sendRejectedEmail({
          to: request.host.email,
          entityName: request.name,
          entityType: "Event",
          reason,
        });
      } catch (emailErr) {
        console.error("Failed to send rejection email:", emailErr);
      }
    }

    return updated;
  }

  static async completeEvent(id: string) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");
    const result = await EventRequestRepo.updateStatus(id, "completed");

    // Award completeEvent XP to the event organizer (eventFoxer path)
    // `hostId` was a second fallback here, but Event has no such column — the
    // organizer FK is the only one.
    const organizerId = request.organizerId;
    if (organizerId) {
      import("../passport/passport.service")
        .then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          return PassportSvc.awardXP(
            organizerId,
            UserPath.eventFoxer,
            XP_REWARDS.completeEvent,
          );
        })
        .catch(() => {});
    }

    return result;
  }

  static async getMyRequests(clientId: string) {
    return EventRequestRepo.findAll({ clientId });
  }

  static async getRequestById(id: string) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");
    return request;
  }

  /**
   * Every event request, for the admin console. Gated on `queue:read`.
   *
   * Pass-through. It exists so controllers reach the data layer through a
   * service, which `tools/validate-architecture.mjs` enforces.
   */
  static async findAllAdmin(filters?: { requestStatus?: string }) {
    return EventRequestRepo.findAllAdmin(filters);
  }

  /**
   * Approved event requests, for the public listing.
   *
   * Pass-through. It exists so controllers reach the data layer through a
   * service, which `tools/validate-architecture.mjs` enforces.
   */
  static async findAllApproved() {
    return EventRequestRepo.findAllApproved();
  }
}
