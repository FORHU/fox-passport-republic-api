import { VenueCategory } from "@prisma/client";
import type { ProviderSpecialtySuggestionStatus } from "@prisma/client";
import { badRequest, conflict, notFound } from "../../utils/errors";
import { recordChange, type AuditActor } from "../audit/audit.service";
import CategoryRepo from "./category.repository";
import SpecialtySuggestionRepo from "./specialty-suggestion.repository";

/** How many open requests one person may have at a time. */
export const MAX_PENDING_PER_USER = 5;

/**
 * "Drone Photography" -> "drone_photography": the shape listing slugs take
 * (see the slug rule in category.controller.ts). Empty when nothing usable is
 * left, such as a name in a script the slug alphabet does not cover.
 */
export const toSpecialtySlug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/, "");

/** A slug that is already a catalog row or a venue category cannot be asked for. */
const VENUE_SLUGS = new Set<string>(Object.values(VenueCategory));

/**
 * Specialties Provider applicants ask for that the catalog lacks (api#440).
 * A suggestion is a request, never a specialty: it stays out of the catalog,
 * and so out of every form and check, until someone with `categories:manage`
 * approves it, which creates the listing subcategory everyone then sees.
 */
export default class SpecialtySuggestionSvc {
  /**
   * Records a request. Asking for something already open returns that
   * request instead of a second row, so the review queue has one entry per
   * missing specialty.
   */
  static async suggest(name: string, userId: string) {
    const clean = name.trim().replace(/\s+/g, " ");
    const slug = toSpecialtySlug(clean);
    if (slug.length < 2) {
      throw badRequest("Use letters or numbers to name the specialty");
    }
    if (VENUE_SLUGS.has(slug) || (await CategoryRepo.slugExists(slug))) {
      throw conflict("This specialty is already in the list");
    }

    const open = await SpecialtySuggestionRepo.findPendingBySlug(slug);
    if (open) return { suggestion: open, created: false };

    if (
      (await SpecialtySuggestionRepo.countPendingBy(userId)) >=
      MAX_PENDING_PER_USER
    ) {
      throw badRequest(
        `You can have up to ${MAX_PENDING_PER_USER} suggestions waiting for review`,
      );
    }

    const suggestion = await SpecialtySuggestionRepo.create({
      name: clean,
      slug,
      suggestedById: userId,
    });
    return { suggestion, created: true };
  }

  static async list(status: ProviderSpecialtySuggestionStatus = "pending") {
    return SpecialtySuggestionRepo.list(status);
  }

  private static async pending(id: string) {
    const suggestion = await SpecialtySuggestionRepo.findById(id);
    if (!suggestion) throw notFound("Suggestion");
    if (suggestion.status !== "pending") {
      throw conflict("This suggestion has already been reviewed");
    }
    return suggestion;
  }

  /**
   * Adds the specialty to the catalog as a listing subcategory, under the
   * name the reviewer gives (or the one asked for), and closes every open
   * request for it.
   */
  static async approve(id: string, actor: AuditActor, name?: string) {
    const suggestion = await this.pending(id);
    if (await CategoryRepo.slugExists(suggestion.slug)) {
      throw conflict(
        "A category with this slug already exists; reject this suggestion",
      );
    }
    const root = (await CategoryRepo.getTopLevelCategories()).find(
      (c) => c.slug === "listing",
    );
    if (!root) throw notFound("Listing category");

    const category = await SpecialtySuggestionRepo.approve({
      slug: suggestion.slug,
      name: name?.trim() || suggestion.name,
      listingRootId: root.id,
      reviewerId: actor.userId,
    });
    await CategoryRepo.invalidateAll();
    await recordChange(actor, "category.create", category.id, {
      current: category,
      fromSuggestion: suggestion.id,
    });
    return category;
  }

  static async reject(id: string, actor: AuditActor) {
    await this.pending(id);
    const rejected = await SpecialtySuggestionRepo.reject(id, actor.userId);
    await recordChange(actor, "specialty_suggestion.reject", id, {
      current: rejected,
    });
    return rejected;
  }
}
