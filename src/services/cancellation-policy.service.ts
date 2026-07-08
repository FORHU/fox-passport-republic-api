import CancellationPolicyRepo from "../repositories/cancellation-policy.repository";

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

  private static toApi(policy: any): any {
    if (!policy) return policy;
    return {
      ...policy,
      rules: this.toApiRules(policy.rules || []),
    };
  }

  static async getAll() {
    const policies = await CancellationPolicyRepo.findAll();
    return policies.map((p) => this.toApi(p));
  }

  static async getById(id: string) {
    const policy = await CancellationPolicyRepo.findById(id);
    if (!policy) throw new Error("Cancellation policy not found");
    return this.toApi(policy);
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
      | { hoursBeforeEvent: number; refundPercent: number }[]
      | undefined;
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
