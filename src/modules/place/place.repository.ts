import type { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** Places (api#518). */
export default class PlaceRepo {
  static async create(data: Prisma.PlaceUncheckedCreateInput) {
    return prisma.place.create({ data });
  }

  static async findById(id: string) {
    return prisma.place.findUnique({ where: { id: String(id) } });
  }

  /** The creator's own Places that aren't archived, newest first. */
  static async listByCreator(creatorId: string) {
    return prisma.place.findMany({
      where: { creatorId: String(creatorId), archivedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async update(id: string, data: Prisma.PlaceUncheckedUpdateInput) {
    return prisma.place.update({ where: { id: String(id) }, data });
  }
}
