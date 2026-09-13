# Things that will bite you

**Written 4 September 2026.** Every entry here is something that already went
wrong, or that was caught one step before it did. None of it is hypothetical.

The common shape: **these all fail quietly.** A loud failure teaches you
something. Each of these reports success, or nothing at all, and the cost lands
later on someone who was not there.

Ordered by how expensive the mistake is.

---

## 1. Never let Prisma generate the table-rename migration

`prisma migrate diff` **cannot see a rename**. It compares two schemas, finds one
table gone and another present, and writes:

```
26 DropTable
26 CreateTable
 0 RENAME TO
```

Running that empties `users`, `bookings`, `payments`, `reviews`, `events` and 21
other tables.

`20260904140000_rename_tables_to_snake_case` is hand-written for exactly this
reason — 26 `ALTER TABLE … RENAME TO` plus 124 constraint and index renames.
**Do not regenerate it.** If a future rename is needed, write it by hand and test
it on a throwaway database first. See `adr/0003`.

## 2. Do not remove `migrations.path` from `prisma.config.js`

Migrations resolve *relative to the schema*. Because `schema` points at the
`prisma/schema` folder, Prisma looks for `prisma/schema/migrations` unless told
otherwise — and finds nothing.

What it prints then:

```
No migration found in prisma/migrations
Database schema is up to date!
```

Those two lines together read as success. They mean the history was empty, so
the comparison found nothing to do. A `migrate deploy` in that state believes
there is nothing to apply and exits 0.

## 3. `vi.mock()` with a stale path does not throw

The mock silently never applies and the test passes against the **real**
implementation. Nothing warns you.

Any time files move, re-check every `vi.mock` path resolves to a real file. There
are ten of them. `tsc` will not catch this — mock paths are strings.

## 4. Tests that read source files by path are invisible to refactors

`tests/public-exposure.spec.ts` asserts route middleware chains by reading files
off disk with `readFileSync`. An import rewriter cannot see those paths, and they
broke silently during the module move — caught only because the suite ran.

## 5. A validator that passes may be inert

`tools/validate-architecture.mjs` reported a completely clean tree on its first
run while **every repository rule was dead** — the layer name was derived as
`"repository" + "s"` → `repositorys`, which matches no rule.

It was found by planting a deliberate violation and noticing nothing happened.

**After any change to that file, plant one:**

```ts
// src/modules/venue/__probe.repository.ts
import VenueService from "./venue.service";
export default VenueService;
```

Run `pnpm validate`. If it does not fail, the validator is lying. Delete the
probe afterwards.

## 6. The migration sequence is order-dependent

A fresh database replays all 58 migrations in order and lands correctly —
verified. But main's older migrations reference pre-rename table names, so a
database that applied the rename *before* them hits `ALTER TABLE "Booking"`
after Booking became `bookings`.

Only local databases can reach that state. `prisma migrate reset` fixes it.
This is also why the history is not squashed — `adr/0003`.

## 7. `migrate dev` can reset the database without much warning

It happened on 4 Sep: 148 users, plus every venue, asset, service, booking and
role request, gone. `migrate dev` detects drift and offers a reset; `db:setup` is
`prisma generate && prisma migrate dev`, so it is one script away.

`pnpm exec tsx prisma/seed.ts` restores it. Nothing hand-made survives.

## 8. `eslint --fix` hides failures

`--fix` exits 0 once it has repaired what it can. Put it in the `lint` script and
every auto-fixable error stops failing CI — the check still runs, still passes,
and enforces less than you think.

The `lint` script deliberately does not have it. `lint:fix` is the separate
thing for local use; `format` handles Prettier.

## 9. Lint scope is not what it looks like

Until 4 Sep the eslint config declared only `src/**/*.ts`, so **36 files under
`prisma/` and `tests/` matched no configuration at all**. `eslint prisma`
reported them *ignored*, not clean. They had never been linted.

If you add a top-level directory, add it to the config's `files` list or it is
silently unchecked.

## 10. Two paths in `prisma.config.js` must both stay right

`schema` and `migrations.path`. Getting either wrong fails quietly rather than
loudly — see entry 2.

## 11. A required column with no default only works against an empty table

`20260909014607_add_conversation_requests` (merged to `main`) originally did:

```sql
ALTER TABLE "conversations" ADD COLUMN "initiatorId" TEXT NOT NULL,
ADD COLUMN "status" "ConversationStatus" NOT NULL DEFAULT 'accepted';
```

Prisma's own generated comment above this block said *"This is not possible if
the table is not empty"* — and it shipped anyway. Found 12 Sep running
`migrate deploy` against a local database with 148 seeded users and existing
conversations: `column "initiatorId" of relation "conversations" contains null
values`, migration marked failed in `_prisma_migrations`, all 10 migrations
behind it blocked until resolved. Postgres DDL is transactional, so the local
failure rolled back clean — no partial damage — but the same failure was
waiting for whichever real environment hit it next: the "Owed elsewhere"
Dockerfile note below means that failure is a boot crash, not a watched deploy
step.

**Fixed in the migration file itself** (add nullable → backfill → constrain):
`initiatorId` now backfills from `COALESCE("userAId", "userBId")` for
pre-existing rows before the `NOT NULL` is applied. Safe because every
pre-existing row keeps its default `status` of `'accepted'` — see the model's
own doc-comment — so who "initiated" a thread that predates this column is
cosmetic. **Editing an already-merged migration file changes its checksum**,
which only matters for an environment that already applied the original
version successfully (only possible against a table that was empty at deploy
time); confirm that hasn't happened in staging/prod before assuming this is
the end of it. Any local database still holding the failed record needs
`prisma migrate resolve --rolled-back 20260909014607_add_conversation_requests`
before `migrate deploy` will pick up the fix.

Generally: a required column with no `@default` is safe to hand-write only when
the table is provably empty in every environment that will run it. Otherwise
it is an add-nullable-then-backfill-then-constrain migration, always, even when
`prisma migrate dev` offers to generate the one-step version.

## 12. A migration baselined with `migrate resolve --applied` was never tested against a real deploy

`20260912164852_central_payment_bidding_partnership_reconciliation` exists
because the dev database drifted ahead of migration history — the central
payment/bidding/partnership schema had been applied with `prisma db push`,
which doesn't write a migration file, and by the time this was noticed the
drift was too large for `migrate dev` to reconcile without offering a full
`migrate reset` (entry 7).

The fix was: generate the SQL diff between the 74 tracked migrations and the
current schema (`migrate diff`, needs `shadowDatabaseUrl` — added to
`prisma.config.js`, wired to `SHADOW_DATABASE_URL`), write it as migration 75,
and mark it `--applied` since the dev DB already had this state. Verified two
ways — `migrate diff --exit-code` reports no drift, and all 75 migrations
replay cleanly via `migrate deploy` against a **completely fresh** database —
but "fresh" is the operative word. Neither check proves anything about running
it against a database that already has real data and a different history,
which is exactly the entry-11 failure mode (a column addition that's safe
against an empty table and not against a populated one).

**Before this branch — or this migration specifically — ever reaches a shared
environment: run `prisma migrate deploy` against a copy of that environment's
actual data first**, not just a fresh one. Baselining assumes the target
already matches; nothing has confirmed that assumption for anywhere but this
one developer machine.

---

## Owed elsewhere

- **`add_audit_log` was applied locally and nowhere else.** Whenever staging or
  prod next deploy, they need it, or the table is missing under code that writes
  to it. Unverifiable from a developer machine.
- **The Dockerfile runs `prisma migrate deploy` at container boot.** A migration
  that fails does not fail a deploy step someone is watching — it fails
  *startup*. Entry 11 above is a live instance of this, not yet fixed.
- **Entry 12's migration has never run against real (non-fresh) data.** There
  is no staging or production environment yet, so this is a flag for whenever
  one exists, not an active risk today — but it is the first thing to check
  before this repository's first real deploy.
