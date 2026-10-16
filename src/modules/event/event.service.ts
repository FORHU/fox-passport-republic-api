import { conflict, notFound } from "../../utils/errors";
import EventRepo, { PublicEventFilters } from "./event.repository";

/**
 * The event module had neither a service nor a repository: one controller held
 * the query and answered the route. This is the missing middle - see
 * `docs/REDIS-PLAN.md` §0b.
 *
 * Not cached. The list is per host and narrow, the query is a single indexed
 * `findMany` with a `take`, and a host who has just created an event goes
 * straight here to look for it.
 */
export default class EventSvc {
  static async getPublicEvents(filters: Omit<PublicEventFilters, "now">) {
    return EventRepo.findPublicEvents({ ...filters, now: new Date() });
  }

  static async setPublicVisibility(
    id: string,
    clientId: string,
    isPublic: boolean,
  ) {
    const count = await EventRepo.setPublicVisibility(
      id,
      clientId,
      isPublic,
      new Date(),
    );
    if (count === 0) {
      if (isPublic) {
        throw conflict(
          "Only approved upcoming events can be published",
          "EVENT_NOT_PUBLISHABLE",
        );
      }
      throw notFound("Event");
    }
  }

  static async getEventsByOrganizer(organizerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return EventRepo.findByOrganizer(organizerId, skip, limit);
  }
}
