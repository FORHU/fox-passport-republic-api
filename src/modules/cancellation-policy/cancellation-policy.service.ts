import CancellationPolicyRepo from "./cancellation-policy.repository";
import { prisma } from "../../utils/prisma";

interface RuleInput {
  fromHours: number;
  toHours?: number | null;
  refundPercent: number;
}

export default class CancellationPolicySvc {
  private static toApiRules(
    rules: { id: string; hoursBeforeEvent: number; refundPercent: number }[],
  ): {
    id: string;
    fromHours: number;
    toHours: number | null;
    refundPercent: number;
  }[] {
    const sorted = [...rules].sort(
      (a, b) => b.hoursBeforeEvent - a.hoursBeforeEvent,
    );
    return sorted.map((rule, i) => ({
      id: rule.id,
      fromHours: rule.hoursBeforeEvent,
      toHours: i > 0 ? sorted[i - 1].hoursBeforeEvent : null,
      refundPercent: rule.refundPercent,
    }));
  }

  /**
   * Re-shapes a stored policy's rules into the API's from/to hour ranges,
   * leaving every other column untouched.
   */
  private static toApi<
    T extends {
      rules?: { id: string; hoursBeforeEvent: number; refundPercent: number }[];
    },
  >(policy: T) {
    return {
      ...policy,
      rules: this.toApiRules(policy.rules ?? []),
    };
  }

  /**
   * Returns active cancellation policies.
   * Under the simplified policy system (api#436, app#400), only "Flexible" and
   * "Non-Refundable" options are available. Legacy "Moderate" and "Strict"
   * are excluded from the active list.
   */
  static async getAll() {
    const policies = await CancellationPolicyRepo.findAll();
    const allowed = policies.filter(
      (p) =>
        p.name.toLowerCase() !== "moderate" &&
        p.name.toLowerCase() !== "strict",
    );
    return allowed.map((p) => this.toApi(p));
  }

  static async getById(id: string) {
    const policy = await CancellationPolicyRepo.findById(id);
    if (!policy) throw new Error("Cancellation policy not found");
    return this.toApi(policy);
  }

  /**
   * Resolves or dynamically provisions a CancellationPolicy for a venue or listing.
   * Supports simplified options: "Flexible" (with custom refund percent and deadline hours)
   * or "Non-Refundable" (0% refund).
   */
  static async resolvePolicy(input: {
    cancellationPolicyId?: string;
    cancellationType?: "Flexible" | "Non-Refundable" | string;
    flexibleRefundPercent?: number;
    flexibleRefundHours?: number;
  }): Promise<string | undefined> {
    const {
      cancellationPolicyId,
      cancellationType,
      flexibleRefundPercent,
      flexibleRefundHours,
    } = input;

    if (cancellationType === "Non-Refundable") {
      let nonRef = await prisma.cancellationPolicy.findFirst({
        where: { name: "Non-Refundable", isActive: true },
        include: { rules: true },
      });
      if (!nonRef) {
        nonRef = await prisma.cancellationPolicy.create({
          data: {
            name: "Non-Refundable",
            description: "No refunds under any circumstances.",
            isActive: true,
            rules: {
              create: [{ hoursBeforeEvent: 0, refundPercent: 0 }],
            },
          },
          include: { rules: true },
        });
      }
      return nonRef.id;
    }

    if (
      cancellationType === "Flexible" ||
      flexibleRefundPercent !== undefined ||
      flexibleRefundHours !== undefined
    ) {
      const refundPercent =
        typeof flexibleRefundPercent === "number" &&
        flexibleRefundPercent >= 0 &&
        flexibleRefundPercent <= 100
          ? flexibleRefundPercent
          : 100;
      const hoursBeforeEvent =
        typeof flexibleRefundHours === "number" && flexibleRefundHours >= 0
          ? flexibleRefundHours
          : 24;

      const candidates = await prisma.cancellationPolicy.findMany({
        where: { name: "Flexible", isActive: true },
        include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
      });

      const matched = candidates.find((p) => {
        const topRule = p.rules[0];
        return (
          topRule &&
          topRule.hoursBeforeEvent === hoursBeforeEvent &&
          topRule.refundPercent === refundPercent
        );
      });

      if (matched) return matched.id;

      const created = await prisma.cancellationPolicy.create({
        data: {
          name: "Flexible",
          description: `${refundPercent}% refund up to ${hoursBeforeEvent} hours before the event.`,
          isActive: true,
          rules: {
            create: [
              { hoursBeforeEvent, refundPercent },
              ...(refundPercent < 100
                ? []
                : [{ hoursBeforeEvent: 0, refundPercent: 0 }]),
            ],
          },
        },
      });
      return created.id;
    }

    if (cancellationPolicyId) {
      return cancellationPolicyId;
    }

    const defaultFlexible = await prisma.cancellationPolicy.findFirst({
      where: { name: "Flexible", isActive: true },
    });
    return defaultFlexible?.id;
  }

  static async create(data: {
    name: string;
    description?: string;
    rules: RuleInput[];
  }) {
    if (!data.name?.trim()) throw new Error("Policy name is required");
    if (!data.rules?.length) throw new Error("At least one rule is required");

    const exists = await CancellationPolicyRepo.policyExists(data.name.trim());
    if (exists) throw new Error("A policy with this name already exists");

    for (const rule of data.rules) {
      if (rule.fromHours < 0) throw new Error("fromHours must be >= 0");
      if (rule.refundPercent < 0 || rule.refundPercent > 100) {
        throw new Error("refundPercent must be between 0 and 100");
      }
    }

    const dbRules = data.rules.map((r) => ({
      hoursBeforeEvent: r.fromHours,
      refundPercent: r.refundPercent,
    }));

    const policy = await CancellationPolicyRepo.create({
      name: data.name.trim(),
      description: data.description?.trim(),
      rules: dbRules,
    });

    return this.toApi(policy);
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      rules?: RuleInput[];
    },
  ) {
    const existing = await CancellationPolicyRepo.findById(id);
    if (!existing) throw new Error("Cancellation policy not found");

    if (data.name) {
      const nameConflict = await CancellationPolicyRepo.policyExists(
        data.name.trim(),
        id,
      );
      if (nameConflict)
        throw new Error("A policy with this name already exists");
    }

    let dbRules:
      { hoursBeforeEvent: number; refundPercent: number }[] | undefined;
    if (data.rules) {
      if (!data.rules.length) throw new Error("At least one rule is required");
      for (const rule of data.rules) {
        if (rule.fromHours < 0) throw new Error("fromHours must be >= 0");
        if (rule.refundPercent < 0 || rule.refundPercent > 100) {
          throw new Error("refundPercent must be between 0 and 100");
        }
      }
      dbRules = data.rules.map((r) => ({
        hoursBeforeEvent: r.fromHours,
        refundPercent: r.refundPercent,
      }));
    }

    const policy = await CancellationPolicyRepo.update(id, {
      name: data.name?.trim(),
      description: data.description?.trim(),
      rules: dbRules,
    });

    return this.toApi(policy);
  }

  static async remove(id: string) {
    const policy = await CancellationPolicyRepo.findById(id);
    if (!policy) throw new Error("Cancellation policy not found");
    return CancellationPolicyRepo.softDelete(id);
  }
}
