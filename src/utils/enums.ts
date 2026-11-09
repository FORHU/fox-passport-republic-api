import { RoleType, UserPath } from "@prisma/client";

/**
 * Narrows an arbitrary string (typically a query parameter) to a member of a
 * Prisma enum.
 *
 * Returns `undefined` when the value isn't a valid member, so callers can drop
 * the filter entirely. The previous `value as any` casts handed unvalidated
 * strings straight to Prisma, which rejects them at query time — so
 * `?category=nonsense` surfaced as a 500 instead of simply not filtering.
 */
export function toEnum<T extends Record<string, string>>(
  enumObject: T,
  value: unknown,
): T[keyof T] | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;

  const members = Object.values(enumObject) as string[];
  return members.includes(value) ? (value as T[keyof T]) : undefined;
}

/**
 * Supply roles folded into `providerFoxer` (#273) and removed from `RoleType`.
 * Older web and mobile builds still send them as filters, so they map to
 * `providerFoxer` rather than failing the query.
 */
const RETIRED_ROLE_ALIASES: Record<string, RoleType> = {
  gearFoxer: RoleType.providerFoxer,
  serviceFoxer: RoleType.providerFoxer,
  performerFoxer: RoleType.providerFoxer,
};

/**
 * Narrows role filter values (query parameters) to `RoleType` members:
 * retired supply roles become `providerFoxer`, unknown values are dropped and
 * duplicates removed.
 */
export function toRoleTypes(values: readonly unknown[]): RoleType[] {
  const out = new Set<RoleType>();
  for (const value of values) {
    const role =
      typeof value === "string"
        ? (RETIRED_ROLE_ALIASES[value] ?? toEnum(RoleType, value))
        : undefined;
    if (role) out.add(role);
  }
  return [...out];
}

/**
 * Narrows an XP path query value to `UserPath`, mapping the retired supply
 * paths to `providerFoxer` (older clients still send them). Anything else that
 * isn't a path falls back to `fallback`.
 */
export function toUserPath(value: unknown, fallback: UserPath): UserPath {
  if (typeof value === "string" && value in RETIRED_ROLE_ALIASES) {
    return UserPath.providerFoxer;
  }
  return toEnum(UserPath, value) ?? fallback;
}
