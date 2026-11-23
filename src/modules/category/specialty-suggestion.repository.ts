import { prisma } from "../../utils/prisma";
import type { ProviderSpecialtySuggestionStatus } from "@prisma/client";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  slug: true,
  status: true,
  categoryId: true,
  reviewedAt: true,
  createdAt: true,
} as const;

/** Provider specialty suggestions (api#440): requests for a missing catalog row. */
export default class SpecialtySuggestionRepo {
  static async findById(id: string) {
    return prisma.providerSpecialtySuggestion.findUnique({ where: { id } });
  }

  /** The open request for a slug, if anyone has made one. */
  static async findPendingBySlug(slug: string) {
    return prisma.providerSpecialtySuggestion.findFirst({
      where: { slug, status: "pending" },
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: "asc" },
    });
  }

  static async countPendingBy(userId: string) {
    return prisma.providerSpecialtySuggestion.count({
      where: { suggestedById: userId, status: "pending" },
    });
  }

  static async create(data: {
    name: string;
    slug: string;
    suggestedById: string;
  }) {
    return prisma.providerSpecialtySuggestion.create({
      data,
      select: PUBLIC_FIELDS,
    });
  }

  /** The review queue, oldest first, with who asked. */
  static async list(status: ProviderSpecialtySuggestionStatus) {
    return prisma.providerSpecialtySuggestion.findMany({
      where: { status },
      select: {
        ...PUBLIC_FIELDS,
        suggestedBy: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Approves every open request for `slug` and creates the catalog row under
   * `listing` in one transaction, so a specialty never exists half-approved.
   */
  static async approve(input: {
    slug: string;
    name: string;
    listingRootId: string;
    reviewerId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: {
          slug: input.slug,
          name: input.name,
          parentCategoryId: input.listingRootId,
        },
      });
      await tx.providerSpecialtySuggestion.updateMany({
        where: { slug: input.slug, status: "pending" },
        data: {
          status: "approved",
          categoryId: category.id,
          reviewedById: input.reviewerId,
          reviewedAt: new Date(),
        },
      });
      return category;
    });
  }

  static async reject(id: string, reviewerId: string) {
    return prisma.providerSpecialtySuggestion.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      select: PUBLIC_FIELDS,
    });
  }
}
