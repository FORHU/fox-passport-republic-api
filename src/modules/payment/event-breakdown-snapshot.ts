import { Prisma } from "@prisma/client";

/**
 * The per-line breakdown an Event invoice records in `platformFeeSnapshot`
 * (#264 T12.1). The writer (`eventBreakdownSnapshot`, used by InvoiceSvc) and
 * the reader (`eventBreakdownLines`, used by refunds and payouts) live here
 * together and share the `EventChargeLine` type, so renaming a field breaks
 * the build instead of quietly sending refunds back to the old item amounts.
 */

/**
 * One line an Event checkout charges, from its stored snapshot. A `type`,
 * not an `interface`, so it is assignable to Prisma's JSON input.
 */
export type EventChargeLine = {
  sourceId: string;
  price: number;
  commissionPct: number;
  commission: number;
  platformFeePct: number;
  platformFee: number;
  processingFee: number;
  lineTotal: number;
};

/** What an Event checkout charges, from its lines' stored snapshots. */
export interface EventCharges {
  itemsTotal: number;
  commissionTotal: number;
  platformFee: number;
  processingFee: number;
  total: number;
  lines: EventChargeLine[];
}

const SNAPSHOT_KIND = "event_breakdown";

/** Every numeric field of a line. A key missing from `EventChargeLine` fails the build. */
const NUMERIC_LINE_KEYS = [
  "price",
  "commissionPct",
  "commission",
  "platformFeePct",
  "platformFee",
  "processingFee",
  "lineTotal",
] as const satisfies readonly Exclude<keyof EventChargeLine, "sourceId">[];

// And a field added to `EventChargeLine` but not to the list fails it too.
type MissingKey = Exclude<
  keyof EventChargeLine,
  "sourceId" | (typeof NUMERIC_LINE_KEYS)[number]
>;
const allKeysListed: [MissingKey] extends [never] ? true : never = true;
void allKeysListed;

/** The `platformFeeSnapshot` an Event invoice stores. */
export function eventBreakdownSnapshot(charges: EventCharges) {
  return {
    kind: SNAPSHOT_KIND,
    commissionTotal: charges.commissionTotal,
    platformFee: charges.platformFee,
    processingFee: charges.processingFee,
    total: charges.total,
    lines: charges.lines,
  } satisfies Prisma.InputJsonObject;
}

/**
 * Each line an Event invoice charged with the per-line breakdown, by
 * transaction id. Empty for any other invoice (an older one, or one not
 * for an Event).
 */
export function eventBreakdownLines(
  snapshot: Prisma.JsonValue | null | undefined,
): Map<string, EventChargeLine> {
  const lines = new Map<string, EventChargeLine>();
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    snapshot.kind !== SNAPSHOT_KIND ||
    !Array.isArray(snapshot.lines)
  ) {
    return lines;
  }
  for (const raw of snapshot.lines) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    if (typeof raw.sourceId !== "string") continue;
    if (!NUMERIC_LINE_KEYS.every((key) => typeof raw[key] === "number")) {
      continue;
    }
    const line = { sourceId: raw.sourceId } as EventChargeLine;
    for (const key of NUMERIC_LINE_KEYS) line[key] = raw[key] as number;
    lines.set(raw.sourceId, line);
  }
  return lines;
}
