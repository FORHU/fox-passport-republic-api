/**
 * A safe `deleteMany` id filter for test cleanup.
 *
 * `only(ids.a, ids.b)` matches just the ids a test created. Never write
 * `{ id: ids.x }` in cleanup: if setup failed before `ids.x` was set, it is
 * `undefined`, Prisma drops the filter, and `deleteMany` deletes every row in
 * the table. Missing ids are left out, so `only()` with none matches nothing.
 */
export const only = (...values: (string | undefined | null)[]) => ({
  in: values.filter((v): v is string => !!v),
});
