import PlatformFeeConfigRepo from "./platform-fee-config.repository";
import {
  recordChange,
  listAuditForTarget,
  type AuditActor,
} from "../audit/audit.service";
import PricingSvc from "../pricing/pricing.service";
import { badRequest, notFound } from "../../utils/errors";
import { END_BEFORE_START_MESSAGE } from "../../utils/validation";
import {
  EVENT_ITEM_TRANSACTION_TYPE,
  EVENT_ITEM_TYPES,
  eventItemRuleProblem,
} from "../pricing/event-item-fee";

/**
 * Not a Prisma enum — `PlatformFeeConfig.transactionType` is a free string.
 * `event` and `sponsorship` are what the `PricingSvc.resolvePricingRule`
 * callers pass (`event-checkout.service.ts`, `partnership-checkout.service.ts`).
 * `event_item` is read only by `PricingSvc.resolveEventItemFeeRates`, which
 * ignores every other type, including rules with none. Extend this list
 * alongside any new caller that introduces a new transaction source.
 */
export const KNOWN_TRANSACTION_TYPES = [
  "event",
  "sponsorship",
  // FoxPassport fee on each Foxer line of an Event (#264). Its category is the
  // item type and its subcategory the listing's category; see event-item-fee.ts.
  EVENT_ITEM_TRANSACTION_TYPE,
] as const;

/**
 * The categories an `event`/`sponsorship` rule can name: `EventCategory`
 * values, which is what their `resolvePricingRule` callers pass.
 */
export const KNOWN_CATEGORIES = [
  "corporate",
  "birthday",
  "wedding",
  "social",
  "other",
] as const;

/** Every category a rule can name: Event categories, or Event line item types. */
export const ALL_RULE_CATEGORIES = [
  ...KNOWN_CATEGORIES,
  ...EVENT_ITEM_TYPES,
] as const;

interface FeeRuleInput {
  name: string;
  transactionType?: string | null;
  category?: string | null;
  subcategory?: string | null;
  percentage?: number | null;
  fixedAmount?: number | null;
  currency?: string;
  priority?: number;
  effectiveFrom?: Date;
  effectiveUntil?: Date | null;
}

function assertValidRule(data: FeeRuleInput) {
  if (!data.name?.trim()) throw badRequest("Enter a name for the fee rule.");
  if (data.percentage == null && data.fixedAmount == null) {
    throw badRequest("Add a percentage, a fixed amount, or both.");
  }
  if (
    data.effectiveFrom &&
    data.effectiveUntil &&
    data.effectiveUntil <= data.effectiveFrom
  ) {
    throw badRequest(END_BEFORE_START_MESSAGE);
  }
  const eventItemProblem = eventItemRuleProblem(data);
  if (eventItemProblem) throw badRequest(eventItemProblem);
  // An Event line item type only means something on an `event_item` rule; on
  // any other rule it would never match a real caller.
  if (
    data.transactionType !== EVENT_ITEM_TRANSACTION_TYPE &&
    data.category != null &&
    (EVENT_ITEM_TYPES as readonly string[]).includes(data.category)
  ) {
    throw badRequest(
      `The category "${data.category}" is an Event line item type. Set the transaction type to "${EVENT_ITEM_TRANSACTION_TYPE}".`,
    );
  }
}

// Prisma's `Decimal` serializes to a string over JSON by default — every
// other money-decimal field in this codebase that reaches the client goes
// through an explicit `.toNumber()` first (see e.g. `service.controller.ts`
// price handling); this does the same so the frontend can type these as
// plain `number`, not `number | string`.
function toApi<
  T extends {
    percentage: { toNumber(): number } | null;
    fixedAmount: { toNumber(): number } | null;
  },
>(rule: T) {
  return {
    ...rule,
    percentage: rule.percentage?.toNumber() ?? null,
    fixedAmount: rule.fixedAmount?.toNumber() ?? null,
  };
}

export default class PlatformFeeConfigSvc {
  static async getAll(includeInactive: boolean) {
    const rules = await PlatformFeeConfigRepo.findAll(includeInactive);
    return rules.map(toApi);
  }

  static async getById(id: string) {
    const rule = await PlatformFeeConfigRepo.findById(id);
    if (!rule) throw notFound("Fee rule");
    return toApi(rule);
  }

  static async create(data: FeeRuleInput, actor?: AuditActor) {
    assertValidRule(data);
    const rule = await PlatformFeeConfigRepo.create({
      ...data,
      name: data.name.trim(),
    });
    const current = toApi(rule);
    await recordChange(actor, "feeRule.create", rule.id, { current });
    return current;
  }

  static async update(
    id: string,
    data: Partial<FeeRuleInput>,
    actor?: AuditActor,
  ) {
    const existing = await PlatformFeeConfigRepo.findById(id);
    if (!existing) throw notFound("Fee rule");

    // Validate the merged shape, not just the patch — an update that only
    // sends `effectiveUntil` must still be checked against the existing
    // `effectiveFrom`, and clearing both fee fields must still be caught.
    const merged: FeeRuleInput = {
      name: data.name ?? existing.name,
      transactionType:
        data.transactionType !== undefined
          ? data.transactionType
          : existing.transactionType,
      category: data.category !== undefined ? data.category : existing.category,
      subcategory:
        data.subcategory !== undefined
          ? data.subcategory
          : existing.subcategory,
      percentage:
        data.percentage !== undefined
          ? data.percentage
          : existing.percentage?.toNumber(),
      fixedAmount:
        data.fixedAmount !== undefined
          ? data.fixedAmount
          : existing.fixedAmount?.toNumber(),
      effectiveFrom: data.effectiveFrom ?? existing.effectiveFrom,
      effectiveUntil:
        data.effectiveUntil !== undefined
          ? data.effectiveUntil
          : existing.effectiveUntil,
    };
    assertValidRule(merged);

    const rule = await PlatformFeeConfigRepo.update(id, {
      ...data,
      name: data.name?.trim(),
    });
    const current = toApi(rule);
    await recordChange(actor, "feeRule.update", id, {
      previous: toApi(existing),
      current,
    });
    return current;
  }

  static async remove(id: string, actor?: AuditActor) {
    const existing = await PlatformFeeConfigRepo.findById(id);
    if (!existing) throw notFound("Fee rule");
    const result = await PlatformFeeConfigRepo.softDelete(id);
    await recordChange(actor, "feeRule.deactivate", id, {
      previous: toApi(existing),
    });
    return result;
  }

  /** Who changed this rule, when, and from what to what — newest first. */
  static history(id: string) {
    return listAuditForTarget(id);
  }

  /**
   * Which rule would currently win for this context, from the same resolver
   * checkout uses: `resolveEventItemFeeRule` for Event lines (null means
   * checkout would refuse the line), `resolvePricingRule` otherwise.
   */
  static async preview(context: {
    transactionType: string;
    category?: string;
    subcategory?: string;
  }) {
    const rule =
      context.transactionType === EVENT_ITEM_TRANSACTION_TYPE
        ? await PricingSvc.resolveEventItemFeeRule({
            itemType: context.category,
            listingCategory: context.subcategory,
          })
        : await PricingSvc.resolvePricingRule(context);
    return rule ? toApi(rule) : null;
  }
}
