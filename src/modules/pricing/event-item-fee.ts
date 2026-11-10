import {
  AssetCategory,
  ComponentType,
  ServiceCategory,
  VenueCategory,
} from "@prisma/client";

/**
 * The FoxPassport fee on each Foxer line of an Event (#264, plan D4) comes from
 * `PlatformFeeConfig` rules with this transaction type. A rule narrows by:
 *
 * - `category`: the item type (`venue`, `asset`, `service`), and
 * - `subcategory`: the listing's own category (`beach_resort`, `catering`, ...).
 *
 * The most specific active rule wins: type + listing category, then type, then
 * the default rule (no category). So the admin can set one fee for all
 * services and a different one for catering, and either reading of Q1 works.
 *
 * A listing category is only meaningful under its item type: `other` exists in
 * all three enums, so a rule with a `subcategory` must also name a `category`.
 */
export const EVENT_ITEM_TRANSACTION_TYPE = "event_item";

export type EventItemType = ComponentType;

export const EVENT_ITEM_TYPES = Object.values(ComponentType) as EventItemType[];

/** The listing categories each item type can carry, from the Prisma enums. */
export const EVENT_ITEM_CATEGORIES: Record<EventItemType, readonly string[]> = {
  venue: Object.values(VenueCategory),
  asset: Object.values(AssetCategory),
  service: Object.values(ServiceCategory),
};

/** One Foxer line to price: its item type and its listing's own category. */
export interface EventItemFeeInput {
  itemType: EventItemType;
  listingCategory?: string | null;
}

/** The fee rate that applies to one line, and the rule it came from. */
export interface EventItemFeeRate {
  /** In percent: 5 means 5%. Never a fraction. */
  percentage: number;
  ruleId: string;
  ruleName: string;
}

/**
 * Why a rule's item type / listing category pair is not valid for an Event
 * line, or null when it is. Rules for other transaction types are not checked.
 */
export function eventItemRuleProblem(rule: {
  transactionType?: string | null;
  category?: string | null;
  subcategory?: string | null;
  percentage?: number | null;
  fixedAmount?: number | null;
}): string | null {
  if (rule.transactionType !== EVENT_ITEM_TRANSACTION_TYPE) return null;

  const { category, subcategory } = rule;
  if (
    category != null &&
    !EVENT_ITEM_TYPES.includes(category as EventItemType)
  ) {
    return `For Event line fees, the category is the item type: one of ${EVENT_ITEM_TYPES.join(", ")}.`;
  }
  if (subcategory != null && subcategory !== "") {
    if (category == null) {
      return "Choose the item type (venue, asset or service) for a listing category.";
    }
    const allowed = EVENT_ITEM_CATEGORIES[category as EventItemType];
    if (!allowed.includes(subcategory)) {
      return `"${subcategory}" is not a ${category} category. Use one of: ${allowed.join(", ")}.`;
    }
  }
  if (rule.percentage == null) {
    return "Event line fees are a percentage of the Foxer's price. Enter a percentage.";
  }
  if (rule.fixedAmount != null) {
    return "Event line fees are a percentage only. Remove the fixed amount.";
  }
  return null;
}
