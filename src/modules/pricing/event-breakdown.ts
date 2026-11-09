import { Prisma } from "@prisma/client";
import { AppError } from "../../utils/errors";
import type { EventItemType } from "./event-item-fee";

/**
 * The Event price breakdown (#264, plan §2 and §4.4), as plain functions with
 * no database access, so the maths can be tested on its own.
 * `PricingSvc.calculateEventBreakdown` looks up the fee rates and calls these.
 *
 * For each Foxer line with price P:
 *
 *   commission    = P × the EventFoxer's commission %   → the EventFoxer
 *   platformFee   = P × the fee % for its category       → FoxPassport
 *   processingFee = P × PROCESSING_FEE_PERCENT           → covers Stripe
 *   lineTotal     = P + commission + platformFee + processingFee
 *
 * Every fee is charged on the Foxer's price only, never on the commission
 * (plan D3). Each amount is rounded to 2 decimals per line, and every total is
 * the sum of the rounded lines, so the lines the client sees always add up to
 * the total they pay. Rounding is half-up (0.005 → 0.01).
 *
 * Anything that would make a wrong charge (a missing or negative price, a
 * missing listing category, an exclusion that can't be applied, a rate
 * outside 0–100) throws an `AppError` with code
 * `EVENT_BREAKDOWN_INVALID_INPUT` instead of pricing.
 */

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/** The error code for every input this module refuses to price. */
export const EVENT_BREAKDOWN_INVALID_INPUT = "EVENT_BREAKDOWN_INVALID_INPUT";

/**
 * Bad stored data or a caller bug, never the client's fault, so it is a 500,
 * with a code that monitoring can tell apart from a crash.
 */
function invalid(message: string): AppError {
  return new AppError(message, 500, EVENT_BREAKDOWN_INVALID_INPUT);
}

/** A money value as Prisma returns it, a plain number, or a JSON string. */
export type MoneyInput = Decimal | number | string | null | undefined;

/** One Foxer line to price. */
export interface EventBreakdownInputLine {
  kind: EventItemType;
  /** The template row (`EventTemplateAsset.id`, ...), when there is one. */
  itemId?: string;
  /** The listing (`assetId`, `serviceId`, `venueId`). */
  listingId?: string;
  /** Who is paid this line's price. */
  foxerId?: string;
  /** The listing's own category (`beach_resort`, `catering`, ...). */
  category?: string | null;
  /** The Foxer's listing price for one unit. Required; 0 is allowed. */
  unitPrice: MoneyInput;
  /**
   * Units booked; gear can be booked several times, everything else is 1.
   * Unset or 0 means 1, as event pricing has always read it (`quantity || 1`).
   */
  quantity?: number | null;
}

/** One priced line, as the client sees it. Percentages are in percent. */
export interface EventBreakdownLine {
  kind: EventItemType;
  itemId?: string;
  listingId?: string;
  foxerId?: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  /** The Foxer's price for this line: unitPrice × quantity. Paid in full. */
  price: number;
  commissionPct: number;
  commission: number;
  platformFeePct: number;
  /** The fee rule that set `platformFeePct`, for the booking snapshot. */
  platformFeeRuleId?: string;
  platformFeeRuleName?: string;
  platformFee: number;
  processingFeePct: number;
  processingFee: number;
  lineTotal: number;
}

export interface EventBreakdown {
  lines: EventBreakdownLine[];
  /** Σ price: what the Foxers receive. */
  itemsTotal: number;
  /** Σ commission: what the EventFoxer receives. */
  commissionTotal: number;
  /** Σ platformFee: what FoxPassport keeps. */
  platformFee: number;
  /** Σ processingFee: covers Stripe; paid to no one. */
  processingFee: number;
  /** What the client pays: Σ lineTotal. */
  total: number;
  /** Alias of `total` for current API consumers (plan §4.4). */
  estimatedTotal: number;
  currency: string;
}

/** The FoxPassport fee for one line, and the rule it came from. */
export interface EventLineFeeRate {
  percentage: number;
  ruleId?: string;
  ruleName?: string;
}

/** The rates for one breakdown. Each percentage is 0–100, in percent. */
export interface EventBreakdownRates {
  commissionPct: number;
  /** Index-aligned with the input lines. */
  platformFees: readonly EventLineFeeRate[];
  processingFeePct: number;
  currency?: string;
}

/** Events are priced in pesos, like their transactions (`currency` defaults to PHP). */
export const EVENT_CURRENCY = "PHP";

/** A required, non-negative amount. Missing is refused, never read as 0. */
function toDecimal(value: MoneyInput, what: string): Decimal {
  if (value === null || value === undefined || value === "") {
    throw invalid(
      `${what} is missing. Load the listing's price before pricing the Event.`,
    );
  }
  let d: Decimal;
  try {
    d = new Decimal(value as Decimal | number | string);
  } catch {
    throw invalid(`${what} is not a number: ${String(value)}`);
  }
  if (!d.isFinite()) throw invalid(`${what} is not a number: ${String(value)}`);
  if (d.isNegative())
    throw invalid(`${what} can't be negative: ${d.toString()}`);
  return d;
}

function checkPercent(value: number, what: string): Decimal {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw invalid(`${what} must be a percentage from 0 to 100, not ${value}.`);
  }
  return new Decimal(value);
}

/** Unset or 0 means 1 (see `EventBreakdownInputLine.quantity`). */
function lineQuantity(quantity: number | null | undefined): number {
  const q = quantity == null || quantity === 0 ? 1 : quantity;
  if (!Number.isInteger(q) || q < 1) {
    throw invalid(
      `The quantity must be a whole number of 1 or more, not ${quantity}.`,
    );
  }
  return q;
}

/** Rounded to 2 decimals, half-up. */
function money(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** `amount × pct%`, rounded to 2 decimals. */
function percentOf(amount: Decimal, pct: Decimal): Decimal {
  return money(amount.times(pct).dividedBy(100));
}

/** Price every line and total them. Pure: the caller supplies the rates. */
export function buildEventBreakdown(
  lines: readonly EventBreakdownInputLine[],
  rates: EventBreakdownRates,
): EventBreakdown {
  if (rates.platformFees.length !== lines.length) {
    throw invalid(
      `Got ${rates.platformFees.length} fee rates for ${lines.length} lines.`,
    );
  }
  const commissionPct = checkPercent(rates.commissionPct, "The commission");
  const processingPct = checkPercent(
    rates.processingFeePct,
    "The processing fee",
  );

  let itemsTotal = new Decimal(0);
  let commissionTotal = new Decimal(0);
  let platformFeeTotal = new Decimal(0);
  let processingTotal = new Decimal(0);

  const priced = lines.map((line, i): EventBreakdownLine => {
    const quantity = lineQuantity(line.quantity);
    const unitPrice = money(
      toDecimal(line.unitPrice, `The ${line.kind} price`),
    );
    const price = money(unitPrice.times(quantity));
    const fee = rates.platformFees[i];
    const feePct = checkPercent(fee.percentage, "The FoxPassport fee");

    const commission = percentOf(price, commissionPct);
    const platformFee = percentOf(price, feePct);
    const processingFee = percentOf(price, processingPct);
    const lineTotal = price
      .plus(commission)
      .plus(platformFee)
      .plus(processingFee);

    itemsTotal = itemsTotal.plus(price);
    commissionTotal = commissionTotal.plus(commission);
    platformFeeTotal = platformFeeTotal.plus(platformFee);
    processingTotal = processingTotal.plus(processingFee);

    return {
      kind: line.kind,
      ...(line.itemId !== undefined && { itemId: line.itemId }),
      ...(line.listingId !== undefined && { listingId: line.listingId }),
      ...(line.foxerId !== undefined && { foxerId: line.foxerId }),
      category: line.category ?? null,
      quantity,
      unitPrice: unitPrice.toNumber(),
      price: price.toNumber(),
      commissionPct: commissionPct.toNumber(),
      commission: commission.toNumber(),
      platformFeePct: feePct.toNumber(),
      ...(fee.ruleId !== undefined && { platformFeeRuleId: fee.ruleId }),
      ...(fee.ruleName !== undefined && { platformFeeRuleName: fee.ruleName }),
      platformFee: platformFee.toNumber(),
      processingFeePct: processingPct.toNumber(),
      processingFee: processingFee.toNumber(),
      lineTotal: lineTotal.toNumber(),
    };
  });

  const total = itemsTotal
    .plus(commissionTotal)
    .plus(platformFeeTotal)
    .plus(processingTotal);

  return {
    lines: priced,
    itemsTotal: itemsTotal.toNumber(),
    commissionTotal: commissionTotal.toNumber(),
    platformFee: platformFeeTotal.toNumber(),
    processingFee: processingTotal.toNumber(),
    total: total.toNumber(),
    estimatedTotal: total.toNumber(),
    currency: rates.currency ?? EVENT_CURRENCY,
  };
}

/**
 * Template rows a booking leaves out, by template row id. The one definition
 * for both event pricing paths: `EventTemplateSvc.calculateItemsTotal` and
 * `eventTemplateLines` here.
 */
export interface EventBreakdownExclusions {
  excludedAssetIds?: readonly string[];
  excludedServiceIds?: readonly string[];
  excludedVenueIds?: readonly string[];
}

/**
 * Whether a template row is excluded. A row loaded without its `id` can't be
 * matched, so when exclusions of that kind were asked for, it throws instead
 * of silently charging for an item the client removed.
 */
export function isExcludedRow(
  excludedIds: readonly string[] | undefined,
  rowId: string | undefined,
  kind: EventItemType,
): boolean {
  if (!excludedIds || excludedIds.length === 0) return false;
  if (rowId === undefined) {
    throw invalid(
      `Can't apply the ${kind} exclusions: the template's ${kind} rows were loaded without their ids.`,
    );
  }
  return excludedIds.includes(rowId);
}

interface Listing {
  id?: string;
  price?: MoneyInput;
  category?: string | null;
}

/**
 * The minimum template shape the breakdown needs. Structural, like
 * `TemplateForPricing`, so templates loaded with different `include`s fit.
 * Each listing must include its `price` and `category`, and should include
 * its owner (for `foxerId`).
 */
export interface EventTemplateForBreakdown {
  templateAssets?:
    | {
        id?: string;
        quantity?: number | null;
        asset?: (Listing & { ownerId?: string }) | null;
      }[]
    | null;
  templateServices?:
    { id?: string; service?: (Listing & { ownerId?: string }) | null }[] | null;
  templateVenues?:
    { id?: string; venue?: (Listing & { mayorId?: string }) | null }[] | null;
}

/**
 * The listing's category, which picks its fee rule. Every listing has one
 * (the column is required), so a missing one means the caller didn't load
 * it, and pricing on would charge the wrong fee.
 */
function requireCategory(listing: Listing, kind: EventItemType): string {
  if (!listing.category) {
    throw invalid(
      `The ${kind} listing${listing.id ? ` ${listing.id}` : ""} has no category. Load the listing's category before pricing the Event.`,
    );
  }
  return listing.category;
}

/**
 * Whether a template row has a listing to price. `null` means the listing is
 * gone (the relation is optional), so there is no Foxer to pay and the row is
 * skipped. `undefined` means the caller didn't load it; skipping that would
 * drop a Foxer from the bill, so it throws.
 */
function hasListing<L>(
  listing: L | null | undefined,
  kind: EventItemType,
): listing is L {
  if (listing === undefined) {
    throw invalid(
      `The template's ${kind} rows were loaded without their ${kind}. Include it before pricing the Event.`,
    );
  }
  return listing !== null;
}

/**
 * A template's Foxer lines, in order: gear, then services, then venues.
 *
 * The price is the Foxer's **listing price** (plan D1). A template row's
 * `agreedPrice` is ignored; T6.3 removes the EventFoxer override that sets
 * it. A row whose listing no longer exists (`null`) has no Foxer to pay, so it
 * is left out, as is any row in `exclusions`.
 */
export function eventTemplateLines(
  template: EventTemplateForBreakdown,
  exclusions?: EventBreakdownExclusions,
): EventBreakdownInputLine[] {
  const lines: EventBreakdownInputLine[] = [];

  for (const ta of template.templateAssets ?? []) {
    if (isExcludedRow(exclusions?.excludedAssetIds, ta.id, "asset")) continue;
    if (!hasListing(ta.asset, "asset")) continue;
    lines.push({
      kind: "asset",
      itemId: ta.id,
      listingId: ta.asset.id,
      foxerId: ta.asset.ownerId,
      category: requireCategory(ta.asset, "asset"),
      unitPrice: ta.asset.price,
      quantity: ta.quantity,
    });
  }
  for (const ts of template.templateServices ?? []) {
    if (isExcludedRow(exclusions?.excludedServiceIds, ts.id, "service"))
      continue;
    if (!hasListing(ts.service, "service")) continue;
    lines.push({
      kind: "service",
      itemId: ts.id,
      listingId: ts.service.id,
      foxerId: ts.service.ownerId,
      category: requireCategory(ts.service, "service"),
      unitPrice: ts.service.price,
    });
  }
  for (const tv of template.templateVenues ?? []) {
    if (isExcludedRow(exclusions?.excludedVenueIds, tv.id, "venue")) continue;
    if (!hasListing(tv.venue, "venue")) continue;
    lines.push({
      kind: "venue",
      itemId: tv.id,
      listingId: tv.venue.id,
      foxerId: tv.venue.mayorId,
      category: requireCategory(tv.venue, "venue"),
      unitPrice: tv.venue.price,
    });
  }
  return lines;
}
