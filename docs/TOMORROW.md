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

**Redis across the API**, on `feat/redis-backed-rate-limiting`. Resume at
**`REDIS-PLAN.md` §2b** — caching the payment reads. §1 of that document is what
has landed and why; §3 is what is knowingly still wrong.

The branch name no longer describes its contents. It started as the rate-limit
store and now carries the caching layer, the controller extraction, and a test
database. That is worth knowing before writing the PR title.

### What is not done

- **Nobody has watched a booking page while a payment lands.** Every property in
  §1 is pinned by unit tests, and the two that matter most - a write being
  visible to the next read across processes, and the API starting with Redis
  stopped - are the two a unit test cannot vindicate. This is the gap.
- **§2c: 97 service reads** still have no caching decision made about them.
- **§3: four flags** remain open, each with a reason. The largest is 146 direct
  `prisma` calls still sitting in services.

---

## 1. First commands

```
pnpm install
pnpm exec prisma generate          # the client is not committed
pnpm exec prisma migrate deploy
pnpm exec tsx prisma/seed.ts       # 148 users, 128 venues, both admins
pnpm validate
pnpm exec vitest run               # expect: 313 passing, 27 files, 0 errors
node tools/validate-architecture.mjs   # expect: 184 files, boundaries intact
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

**Redis is on port 6378**, published by `docker-compose.yml` as
`REDIS_HOST_PORT`; `.env` sets `REDIS_PORT=6378` for the API to dial. Something
unrelated also listens on 6379, which is how a config bug once looked like a
successful connection — the startup log now names the address it dialled, and
that line is the only signal, because everything Redis-related is fail-soft.

**`docs/test-suite-wipes-dev-db` should not be merged as it stands.** That branch
carries GOTCHAS 7b, warning that the test suite deletes from the development
database. It was true when written and is not any more. Merging it would
reintroduce a warning telling people to work around a problem that is fixed.

---

## 3. The auth chain, and what is still mismatched

AUTH-01 through AUTH-06 are written. The **api** half merged to `main` via
PR #77 on 8 Sep. The **app** half (`feat/auth-03-api-cookies`) is pushed and
**not merged**, so the api's cookie authorship is live on `main` while the app's
relay is not — which is what produced a logout that did not log anyone out.

The six browser checks are written out as § Browser verification in the app's
`docs/AUTH_HARDENING.md`. **None has been run.** AUTH-05 is blocked outright:
this repository's `.env` has no `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or
`GOOGLE_CALLBACK_URL`.
