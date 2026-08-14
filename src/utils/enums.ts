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
