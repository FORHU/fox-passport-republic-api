import CategoryRepo from "../category/category.repository";

export type SpecialtyCheck =
  { ok: true; slugs: string[] } | { ok: false; message: string };

/**
 * What a Provider specialises in (photography, DJ, sound system...). The valid
 * values are catalog subcategories, so an admin can add one without a deploy.
 * A Provider has at least one and no maximum.
 */
export default class ProviderSpecialtySvc {
  /** Every specialty a Provider can pick, for forms and search. */
  static async list() {
    return CategoryRepo.getProviderSpecialties();
  }

  /**
   * Adds `specialties: [{ slug, name }]` to each Provider in `users`, built from
   * the specializations the query already loaded. People who are not Providers
   * are returned as they were.
   */
  static async attach<
    T extends {
      roleType?: string[];
      foxerSpecializations?: { roleType: string; category: string }[];
    },
  >(users: T[]) {
    const catalog = await this.list();
    const names = new Map(catalog.map((c) => [c.slug, c.name]));
    return users.map((user) => {
      if (!user.roleType?.includes("providerFoxer")) return user;
      const slugs = [
        ...new Set(
          (user.foxerSpecializations ?? [])
            .filter((s) => s.roleType === "providerFoxer")
            .map((s) => s.category),
        ),
      ];
      return {
        ...user,
        specialties: slugs.map((slug) => ({
          slug,
          name: names.get(slug) ?? slug,
        })),
      };
    });
  }

  /**
   * Checks a declared list against the catalog. Returns the cleaned list (each
   * slug once, in the order given) or a message the caller can show as is.
   */
  static async check(declared: unknown): Promise<SpecialtyCheck> {
    const none = "Choose at least one specialty";
    if (!Array.isArray(declared)) return { ok: false, message: none };

    const slugs = [
      ...new Set(declared.map((s) => String(s).trim()).filter(Boolean)),
    ];
    if (slugs.length === 0) return { ok: false, message: none };

    const valid = new Set((await this.list()).map((c) => c.slug));
    const unknown = slugs.filter((s) => !valid.has(s));
    if (unknown.length > 0) {
      return { ok: false, message: `Unknown specialty: ${unknown.join(", ")}` };
    }
    return { ok: true, slugs };
  }
}
