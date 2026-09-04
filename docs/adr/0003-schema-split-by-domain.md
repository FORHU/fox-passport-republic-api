# 3. Split the Prisma schema by domain, and do not let Prisma rename tables

Date: 2026-09-04

## Status

Accepted. The split is done. The table renames described in **Consequences** are
deliberately *not* done — see "The trap".

## Context

`prisma/schema.prisma` had grown to 1,149 lines: 42 models and 27 enums in one
file, ordered by when each was added rather than by what it belongs to. Finding
the models involved in a change meant scrolling, and reviewing a schema diff
meant reading line numbers rather than a domain.

Two separate things were proposed at once, and they have very different costs:

1. **Organise the file.** Prisma 7 loads a *folder* of `.prisma` files and
   stitches them into one schema, relations crossing files freely.
2. **Rename the tables**, so every model has an explicit `@@map` and the
   database stops mixing `venues` with `"User"`.

Only the first is safe. This ADR records both, because the second looks routine
and is not.

## Decision

**Split the schema into `prisma/schema/*.prisma`, grouped by domain.**

| File | Holds |
|---|---|
| `base` | generator and datasource |
| `identity` | `User`, `RoleRequest`, the five `*Application` models, `RefreshToken` |
| `catalog` | `Asset`, `Service`, `Venue` |
| `event` | `EventTemplate` and its joins, `Event`, the three `Event*Transaction` |
| `booking` | `Booking`, `BookingAttendee`, `ServiceBooking`, `AssetBooking`, `Waitlist` |
| `money` | `Payment`, `Payout`, `Refund`, `StripeEvent`, cancellation policy and rules |
| `passport` | `Passport`, `PassportPath`, `Badge`, `UserBadge`, `PassportStamp`, `Favorite`, `Review`, `ReviewReply` |
| `platform` | `File`, `Notification`, `AuditLog` |
| `common` | enums referenced by more than one domain |

Blocks were moved verbatim, with the doc comments that precede them. Enums were
placed by scanning which domains actually reference them rather than by
judgement: an enum used by one domain lives with it, one used by several lives
in `common`.

**Grouped by domain, not by Foxer role.** Grouping by role was considered — it
matches how the product is described — and rejected for the same reason it was
rejected for the source tree: `Booking`, `Payment`, `Review`, `File` and
`Notification` serve every role. Filing them under one Foxer would be a
statement that is not true, and the arbitrary choice would have to be
re-litigated by every reader.

## The trap: Prisma cannot see a table rename

Adding `@@map` to the 26 models that lacked one — bringing them in line with the
snake_case-plural convention the other 16 already use — was attempted, and the
generated migration inspected before applying. It was:

```
 87 DropForeignKey
 87 AddForeignKey
 29 CreateIndex
 26 DropTable
 26 CreateTable
  0 RENAME TO
```

```sql
DROP TABLE "User";
...
CREATE TABLE "users" ( ... );
```

**`migrate diff` cannot detect a rename.** It compares two schemas and sees one
table absent and another present, so it drops and recreates. Applying that
migration would have emptied `User`, `Booking`, `Payment`, `Review`, `Event` and
21 other tables.

The `@@map` additions were reverted. Table names stay mixed for now: 16
snake_case, 26 PascalCase.

If the renames are done later they need a **hand-written** migration of 26
`ALTER TABLE "X" RENAME TO "y"` statements, applied with
`prisma migrate resolve --applied`, and tested against a throwaway database
first. Note that Postgres keeps the old constraint and index names through a
table rename, so those need renaming too or later diffs will show noise.

## A second trap, found and fixed

Pointing `schema` at the folder **silently moved where Prisma looks for
migrations**. They resolve relative to the schema, so `prisma/migrations` became
`prisma/schema/migrations`, which does not exist. `migrate status` then reported:

```
No migration found in prisma/migrations
Database schema is up to date!
```

Those two lines together read as success. They mean the history was empty and
the comparison therefore found nothing — a `migrate deploy` in that state would
have believed there was nothing to apply.

`prisma.config.js` now pins `migrations.path` explicitly, with a comment saying
why. **Do not remove it.**

## Consequences

Good:

- The schema is navigable, and a diff names a domain instead of a line range.
- `prisma migrate diff` against the live datasource reports **no difference**,
  so the split changed no database object.
- The client generates and all **198 tests pass**.
- The layout is a target for the source tree, which is being reorganised into
  `src/modules/<domain>/` on the same domain boundaries.

Costs and things to watch:

- **Model placement is a judgement.** `Favorite` and `Review` sit in `passport`
  because they are user-facing engagement rather than catalogue data; that is
  arguable. Moving a model between files is free and changes no SQL, so treat
  the layout as adjustable.
- **Table names remain inconsistent** until the rename migration is written.
- **`prisma.config.js` now has two paths that must stay right** — `schema` and
  `migrations.path`. Getting either wrong fails quietly rather than loudly.
