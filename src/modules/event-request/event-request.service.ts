import { EventCategory, EventStatus } from "@prisma/client";
import { prisma, AppTransactionClient } from "../../utils/prisma";
import { toEnum } from "../../utils/enums";
import EventRequestRepo from "./event-request.repository";
import EventTemplateRepo from "../event-template/event-template.repository";
import EventTemplateSvc from "../event-template/event-template.service";
import { can } from "../../types/permissions";
import { sendApprovedEmail } from "../../utils/emails/approved";
import { sendRejectedEmail } from "../../utils/emails/rejected";
import OrganizerXpService from "../appointment/organizer-xp.service";
import AppointmentAccess from "../appointment/appointment.access";
import NotificationService from "../notifications/user-notification.service";
import { announceAdminQueueChanged } from "../../infrastructure/socket/invalidate";

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

  static async spawnRequestFromTemplate(
    data: {
      clientId: string;
      templateId: string;
      name: string;
      description: string;
      startAt: Date;
      endAt: Date;
      guestCount: number;
      totalAmount?: number;
    },
    tx: AppTransactionClient = prisma,
  ) {
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
    return EventRequestRepo.create(
      {
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
      },
      tx,
    );
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

  /**
   * An Event's status follows its bookings, so nobody has to mark it. It used
   * to change only through `PATCH /event-requests/:id/complete`, which nothing
   * called, so every Event stayed `pending` for good and Organizers never got
   * their completion XP.
   *
   *   every booking cancelled               -> cancelled
   *   every booking completed or cancelled  -> completed (check-in settles a booking)
   *   any booking checked in                -> ongoing
   *
   * Forward only: a finished Event is never reopened. The status change is one
   * conditional write, so only the call that actually moves the Event to
   * `completed` pays its XP. Called after a booking changes; never throws, so
   * it can't fail the booking change that triggered it.
   */
  static async syncStatusFromBookings(eventId: string) {
    try {
      const bookings = await EventRequestRepo.bookingStatuses(eventId);
      if (bookings.length === 0) return;

      const done = (s: string) => s === "completed" || s === "cancelled";
      let next: EventStatus | null = null;
      if (bookings.every((b) => b.status === "cancelled")) {
        next = EventStatus.cancelled;
      } else if (bookings.every((b) => done(b.status))) {
        next = EventStatus.completed;
      } else if (bookings.some((b) => b.checkedIn)) {
        next = EventStatus.ongoing;
      }
      if (!next) return;

      const from: EventStatus[] =
        next === EventStatus.ongoing
          ? [EventStatus.draft, EventStatus.pending]
          : [EventStatus.draft, EventStatus.pending, EventStatus.ongoing];
      const moved = await EventRequestRepo.advanceStatus(eventId, from, next);
      if (moved && next === EventStatus.completed) {
        await this.onCompleted(eventId);
      }
    } catch (e) {
      console.error(`Event status sync failed for ${eventId}`, e);
    }
  }

  /**
   * Runs daily (jobs/unattended-events.job.ts). An Event that ended with
   * bookings and nobody checked in is flagged for review, once, and its Event
   * Foxer told. Its status is left alone: no completion XP, payouts or
   * refunds follow from it. A person settles it. Several API instances run
   * the job at once, so the flag is claimed before anyone is told.
   */
  static async flagUnattendedPast(now = new Date()) {
    const events = await EventRequestRepo.findUnattendedPast(now);
    let flagged = 0;
    for (const event of events) {
      if (!(await EventRequestRepo.claimReviewFlag(event.id, now))) continue;
      flagged++;
      await NotificationService.create({
        userId: event.organizerId,
        type: "EVENT_NEEDS_REVIEW",
        title: "Event needs review",
        message: `${event.name} has ended and nobody was checked in. It stays open until it's reviewed.`,
        metadata: { link: "/creator-dashboard/events", eventId: event.id },
      }).catch((e) =>
        console.error(`Failed to notify review flag for event ${event.id}`, e),
      );
    }
    if (flagged > 0) announceAdminQueueChanged();
    return flagged;
  }

  /** Flagged Events not yet settled, for the admin review list. */
  static async findNeedingReview() {
    return EventRequestRepo.findNeedingReview();
  }

  private static async onCompleted(eventId: string) {
    // Organizers of the Event, and of the Venue it was held at, earn on the
    // Organizer path (ADR 0005). Idempotent, and never throws.
    void OrganizerXpService.onEventCompleted(eventId);

    // completeEvent XP to the Event Foxer who organised it (eventFoxer path).
    // Not idempotent itself: the conditional write in syncStatusFromBookings
    // is what makes it run once.
    const event = await EventRequestRepo.findById(eventId);
    const organizerId = event?.organizerId;
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
  }

  static async getMyRequests(clientId: string) {
    return EventRequestRepo.findAll({ clientId });
  }

  /**
   * One Event's full record — its bookings, and every supplier transaction
   * with its price. Used by the event page's line-items panel, which the
   * route (`GET /event-requests/:id`) used to hand to anyone signed in,
   * regardless of that Event.
   *
   * Who may see it: the client who booked it, its Owner, an admin, and an
   * Organizer with `event:view-sales` (the same read-only set that already
   * covers the Event's bookings elsewhere).
   */
  static async getRequestById(
    id: string,
    viewer?: { userId?: string; systemRole?: string },
  ) {
    const request = await EventRequestRepo.findById(id);
    if (!request) throw new Error("Request not found");

    const userId = viewer?.userId;
    const allowed =
      !!userId &&
      (request.clientId === userId ||
        request.organizerId === userId ||
        can(viewer?.systemRole, "bookings:read:all") ||
        (await AppointmentAccess.canOnEvent(id, userId, "event:view-sales")));
    if (!allowed) throw new Error("Request not found");

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
