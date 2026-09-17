import PlatformFeeConfigRepo from "./platform-fee-config.repository";
import PricingSvc from "../pricing/pricing.service";

/**
 * Not a Prisma enum — `PlatformFeeConfig.transactionType` is a free string,
 * matching every real caller of `PricingSvc.resolvePricingRule`
 * (`event-checkout.service.ts`, `partnership-checkout.service.ts`), which
 * only ever pass one of these two literals today. Extend this list
 * alongside any new caller that introduces a new transaction source.
 */
export const KNOWN_TRANSACTION_TYPES = ["event", "sponsorship"] as const;

/**
 * The only category domain that actually flows into `PricingContext` today
 * — confirmed by grep of every `resolvePricingRule` caller, all of which
 * pass `EventCategory` values. `AssetCategory`/`VenueCategory` exist in the
 * schema but are unused as field types anywhere, so they're deliberately
 * not offered here.
 */
export const KNOWN_CATEGORIES = [
  "corporate",
  "birthday",
  "wedding",
  "social",
  "other",
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
  if (!data.name?.trim()) throw new Error("Fee rule name is required");
  if (data.percentage == null && data.fixedAmount == null) {
    throw new Error("At least one of percentage or fixedAmount is required");
  }
  if (
    data.effectiveFrom &&
    data.effectiveUntil &&
    data.effectiveUntil <= data.effectiveFrom
  ) {
    throw new Error("effectiveUntil must be after effectiveFrom");
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
    if (!rule) throw new Error("Fee rule not found");
    return toApi(rule);
  }

  static async create(data: FeeRuleInput) {
    assertValidRule(data);
    const rule = await PlatformFeeConfigRepo.create({
      ...data,
      name: data.name.trim(),
    });
    return toApi(rule);
  }

  static async update(id: string, data: Partial<FeeRuleInput>) {
    const existing = await PlatformFeeConfigRepo.findById(id);
    if (!existing) throw new Error("Fee rule not found");

    // Validate the merged shape, not just the patch — an update that only
    // sends `effectiveUntil` must still be checked against the existing
    // `effectiveFrom`, and clearing both fee fields must still be caught.
    const merged: FeeRuleInput = {
      name: data.name ?? existing.name,
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
    return toApi(rule);
  }

  static async remove(id: string) {
    const existing = await PlatformFeeConfigRepo.findById(id);
    if (!existing) throw new Error("Fee rule not found");
    return PlatformFeeConfigRepo.softDelete(id);
  }

  /** Which rule would currently win for this context — same resolver Central Payment checkout uses. */
  static async preview(context: {
    transactionType: string;
    category?: string;
    subcategory?: string;
  }) {
    const rule = await PricingSvc.resolvePricingRule(context);
    return rule ? toApi(rule) : null;
  }
}
