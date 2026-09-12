# Tomorrow — the API

**What to do next. Nothing else.** Written 9 Sep 2026, when `REDIS-PLAN.md` had
grown into both the plan and the status of the whole repository and stopped
being either. This file is the running order; everything else is lookup.

| Document                 | Role                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `TOMORROW.md` (this file)| **What to do next.**                                        |
| `REDIS-PLAN.md`          | The caching and layering work: decisions, what landed, flags.|
| `GOTCHAS.md`             | Ten things that fail quietly. Read before touching migrations, the schema, or moving files. |
| `adr/`                   | Decisions that outlived their pull request.                 |

---

## 0. In flight

**Redis across the API**, on `feat/redis-backed-rate-limiting`. **§2 is now
empty** — every item in the running order is struck through as of 10 Sep, §2c
included. §1 of that document is what has landed and why; §3 is what is
knowingly still wrong.

**The browser verification is done too** - B4, on 10 Sep, driven with
Playwright. It failed first (the booking page was outside React Query and could
not hear the invalidation), which needed a fix in the *app* repo; after that the
page flipped in 585ms with the frame in the log. §4 has the numbers.

**So nothing on this branch is waiting on this repository.** What is left is
§3's two flags (`specialization`/`role-assignment` still have no repository;
Redis staying silently optional is deliberate design, not a bug) and this
file's own §3 - the app-side auth merge.

The branch name no longer describes its contents. It started as the rate-limit
store and now carries the caching layer, the controller extraction, and a test
database. That is worth knowing before writing the PR title.

### What is not done

Everything below is done, in the order it happened, kept as a record rather
than a to-do list:

- **Verified end to end, then in a browser - 9-10 Sep.** A write being visible
  to the next read across processes, and the API surviving Redis stopping, were
  driven with `curl` and `redis-cli`; the browser half (a payment landing while
  someone watches the booking page) was driven with Playwright, failed once
  (the page was outside React Query), was fixed in the app repo, then passed
  6/6 at 585ms. `REDIS-PLAN.md` §4 has the numbers.
- **A Redis blip used to disable the cache until the API restarted.** Found
  during that run, fixed the same day - the client reconnects on a capped
  backoff once it has connected at all, and commands fail fast rather than
  queueing while it does. `REDIS-PLAN.md` §1 has the reasoning.
- **§2c is done.** All 97 service reads have a decision: 51 cached across nine
  namespaces, the rest deliberately not, each with its reason recorded in
  `REDIS-PLAN.md` §1. The ones worth knowing without opening it:
  `service-booking` and `asset-booking` `getAvailability` are **not** cached and
  must not be without invalidation - a stale free/busy answer is two people told
  the same slot is free - and `AuthRepo.updateUserLoginStatus` deliberately does
  not retire the user namespace, because it runs on every sign-in.
- **Reviews stopped inventing bookings.** `bookingId` is required now; the
  branch that fabricated one against the newest event in the system is gone.
- **`passport` was extracted into a repository.** The heaviest module by
  direct `prisma` calls (20) and the one with none of its own; now zero, and
  its cache invalidation collapsed from six hand-written calls to one
  `retiring` helper. `124` direct `prisma` calls remain across services, down
  from 162 at the start of this branch. `users/specialization.service.ts` (17)
  is the next candidate, and note the filing - it is a service inside the
  `users` module, not a module of its own, which is why looking for
  `src/modules/specialization` finds nothing.
- **The admin queues are paginated.** Five queues that silently capped at 500
  rows now report `total`/`totalPages` and take `page`/`limit`; the app-side
  console gained the pager to go with it. `REDIS-PLAN.md` §1 has the reasoning
  and what was deliberately left alone (the public review lists' 200 cap).

**What is left** is §3's two flags - real unfinished work
(`specialization`/`role-assignment` need a repository), and one deliberate
design choice (Redis staying silently optional) - plus this file's own §3, the
app-side auth merge.

---

## 1. First commands

```
pnpm install
pnpm exec prisma generate          # the client is not committed
pnpm exec prisma migrate deploy
pnpm exec tsx prisma/seed.ts       # 148 users, 128 venues, both admins
pnpm validate
pnpm exec vitest run               # expect: 397 passing, 35 files, 0 errors
node tools/validate-architecture.mjs   # expect: 185 files, boundaries intact
```

**Read the error count, not just the pass count.** Vitest prints unhandled
rejections beside a green run. 156 of them sat next to "248 passed" for a day
and were the API failing to boot without Redis. The expected number is zero.

**Do not reach for `pnpm db:setup`.** It is `prisma generate && prisma migrate
dev`, and `migrate dev` is the command that offers to reset the database when it
sees drift. It wiped everything on 4 Sep. The explicit commands above never
prompt.

---

## 2. Things that are true about this machine

**The test suite has its own database.** `foxpassportrepublic_test`, pointed at
by `.env.test.local`, which is gitignored — `.env.test.example` is the copy to
start from. `tests/setup.ts` refuses to seed unless the database name ends in
`_test`, so a missing test database is a loud error rather than 148 deleted
users. Run the whole suite; there is no `--exclude` any more.

**Every limiter goes on the shared store, with a prefix.** `MemoryStore`
isolated the buckets for free by being a fresh instance per limiter; one shared
Redis does not, so two limiters keying on the same email or user id would spend
each other's budget. `createRateLimitStore("<name>:account")` is the whole
requirement, and `tests/rate-limit.store.spec.ts` pins it.

**Redis is on port 6378**, published by `docker-compose.yml` as
`REDIS_HOST_PORT`; `.env` sets `REDIS_PORT=6378` for the API to dial. Something
unrelated also listens on 6379, which is how a config bug once looked like a
successful connection — the startup log now names the address it dialled, and
that line is the only signal, because everything Redis-related is fail-soft.

**`.env.test.local` is only ignored on this branch.** The `.gitignore` line
that hides it landed with the test database, so on `main` the file is untracked
and *visible* - and it holds a database connection string. A `git add -A` while
on `main` commits a password. It disappears again on this branch. The same
applies to anyone who checks out `main` after having run the tests here.

**Commits reach the remote without anyone pushing.** Both branches were found
already up to date at the remote on 9 Sep, at exactly the local commits, with no
push having been run and no hooks in either repository - the IDE is syncing.
Worth knowing before committing anything exploratory: it is on the remote as
soon as it is committed. VS Code's `git.postCommitCommand`, or GitLens'
auto-sync, is where that is turned off.

**`docs/test-suite-wipes-dev-db` should not be merged as it stands.** That branch
carries GOTCHAS 7b, warning that the test suite deletes from the development
database. It was true when written and is not any more. Merging it would
reintroduce a warning telling people to work around a problem that is fixed.

---

## 3. The auth chain — merged 12 Sep, verification still owed

AUTH-01 through AUTH-06 are written. The **api** half merged to `main` via
PR #77 on 8 Sep, and the **app** half merged 12 Sep via PR #60
(`merge-auth-03-into-main`), against an app `main` that had moved substantially
since the branch was cut. Two conflicts (`useLogout.ts`,
`AuthStoreProvider.tsx`), resolved in favor of the app's `endSession()`
abstraction while keeping its `promptLogin` option and `/?auth=expired` toast
handoff. Both repos' cookie authorship is now live on `main` together, which
should close the logout-that-didn't-log-anyone-out bug — **not yet confirmed in
a browser.**

The six browser checks are written out as § Browser verification in the app's
`docs/AUTH_HARDENING.md`. **None has been run.** AUTH-05 is blocked outright:
this repository's `.env` has no `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or
`GOOGLE_CALLBACK_URL`.
