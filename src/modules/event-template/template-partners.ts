import { MatchRequestStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** A package line's kind: what it holds. */
export type LineKind = "asset" | "service" | "venue";

/** A Supplier's answer that means they agreed: accepted, or since booked. */
export const ACCEPTED_MATCH: MatchRequestStatus[] = [
  MatchRequestStatus.accepted,
  MatchRequestStatus.secured,
];

/**
 * Whether a package line's Supplier agreed to it. Every line added to a
 * package is `matched` (a request, api#459), so `matched` alone no longer
 * means yes: it takes an accepted (or since booked) answer. Booking reads
 * this to book a Supplier directly (ADR 0010).
 */
export const hasAgreed = (line: {
  matched: boolean;
  matchRequestStatus: MatchRequestStatus;
}): boolean => line.matched && ACCEPTED_MATCH.includes(line.matchRequestStatus);

/**
 * Of `itemIds`, the listings whose Supplier accepted one of this Event
 * Foxer's requests on any of their packages. Those Suppliers already agreed
 * to work with them, so they count as partners: a replacement needs no
 * confirm (2026-11-20), and adding them to a package needs no request
 * (api#459).
 */
export async function acceptedMatchListings(
  hostId: string,
  kind: LineKind,
  itemIds: string[],
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const where = {
    template: { ownerId: hostId },
    matched: true,
    matchRequestStatus: { in: ACCEPTED_MATCH },
  };
  if (kind === "asset") {
    const rows = await prisma.eventTemplateAsset.findMany({
      where: { ...where, assetId: { in: itemIds } },
      select: { assetId: true },
    });
    return new Set(rows.map((r) => r.assetId!));
  }
  if (kind === "service") {
    const rows = await prisma.eventTemplateService.findMany({
      where: { ...where, serviceId: { in: itemIds } },
      select: { serviceId: true },
    });
    return new Set(rows.map((r) => r.serviceId!));
  }
  const rows = await prisma.eventTemplateVenue.findMany({
    where: { ...where, venueId: { in: itemIds } },
    select: { venueId: true },
  });
  return new Set(rows.map((r) => r.venueId!));
}
