# Redis across the API — plan and progress

Started 8 Sep 2026. Branch: `feat/redis-backed-rate-limiting`, off `main`
(which now carries the whole auth hardening chain via PR #77).

**Resume at §2b.** Everything in §1 is written and green; §2 is the queue.

`TOMORROW.md` is the running order and is shorter than this. Read that first if
you are picking the work up; this file is the reasoning behind it.

---

## 0. The decision, so it is not re-litigated

The question was whether to cache every read or a chosen few. Blanket caching
was chosen deliberately, over an argued objection. Both sides are recorded here
because the objection is the thing that will bite, and whoever hits it should
know it was foreseen rather than missed.

**The case against, as put:** the repositories hold **108 read methods against
104 mutations**. Caching reads wholesale means 104 invalidation points that all
have to be right, and a missed one is a stale-data bug — intermittent in
production, invisible in tests. Most of those reads are also per-user and
already fast; an indexed `findUnique` gains nothing from a network hop to Redis.

**The decision:** Redis goes on the service layer, and every `get` gets it.

**What that means in practice**, and the shape being followed:

- caching lives in **services**, never controllers or repositories;
- anything an operator watches for their own write to appear in is
  **invalidated at the write**, not merely expired;
- anything nobody watches gets a **TTL and no invalidation**, and says so.

The admission test written into `utils/cache.util.ts` — expensive **and**
shared **and** slow-changing — still stands as guidance for choosing TTLs and
deciding which reads need invalidation wired. It is no longer a gate on whether
a read is cached at all.

---

## 0b. The second half of this work: logic out of the controllers

Added 9 Sep, at the user's direction. Caching was the reason each module got
opened; **separating the layers is a goal in its own right**, not a side effect
of making room for a `cached()` call. Where the two disagree — a module worth
untangling but not worth caching — untangle it anyway.

**The rule.** A controller parses and validates its input, calls one service,
and shapes an HTTP response. It does not talk to `prisma`, and it does not hold
business rules. Queries live in the repository, decisions and shaping in the
service.

**Where that stands: done, 9 Sep.** All 36 controllers are free of `prisma`,
down from 50 calls across 8 controllers when this section was written. What
moved, and where it went:

| Controller       | Was | Now | Where it went                                            |
| ---------------- | --- | --- | -------------------------------------------------------- |
| `booking`        | 21  | 0   | three flows to `booking.service`, queries split between `booking.repository` and `event.repository` |
| `admin`          | 17  | 0   | eleven decisions to `admin.service`, writes to `admin.repository` |
| `payment`        | 6   | 0   | the whole Stripe webhook to `payment.service`            |
| `event`          | 2   | 0   | a new `event.service` and `event.repository` - it had neither |
| `event-request`  | 2   | 0   | the decision emails to `event-request.service`, dropping a redundant query |
| `review`         | 1   | 0   | it was a comment                                          |
| `passport`       | 1   | 0   | `passport.service`                                        |
| `event-template` | 1   | 0   | `event-template.service` + `.repository`                  |

`booking.controller.ts` went 1083 lines to 438, `admin` 870 to 591, `payment`
462 to 300. Every handler that remains does the same three things: validate the
input, call one service, shape the response.

**Why nothing catches it.** The architecture validator enforces layer
*imports*, and `prisma` comes from `utils`, which every layer may import. A
controller reaching past its own service to the database trips no rule. The
validator is correct about what it checks; it does not check this. Until the
list above is empty, the count is the check — `grep -c "prisma\."` per
controller.

**How to move.** Verbatim. A query moves into a repository method with its
`where`, `include` and `select` unchanged; if it needs fixing, that is a second
commit with its own reasoning. A relocation that also changes behaviour is one
nobody can review — see the `findStatsInputs` flag in §3, which was moved
knowingly broken for that reason.

**Writes move too, but last.** Reads come out first because caching needs a
service to live in and the risk is low. Writes are a separate pass per module:
the transaction boundary is easy to change by accident, and a write that lands
in a different order is not something a test suite this size will catch.

---

## 1. Done

### Redis-backed rate limiting

`src/utils/rate-limit-store.ts` — new. Both the auth limiters and the app-wide
limiter in `app.ts` ran on the default `MemoryStore` from `express-rate-limit`.

Why it mattered: **a restart handed the budget back.** The AUTH-01 per-account
login limit is ten attempts in fifteen minutes; an attacker who spent it only
had to wait for a deploy, and under `nodemon` every file save cleared it. The
counters were also per process, so N containers meant N times every published
limit.

Two things the implementation has to keep doing:

- **The client is resolved per command, not at construction.** `setup()` in
  `app.ts` is called without `await` and the limiters are built at module load,
  so Redis is _never_ connected when the stores are constructed. A store that
  captured the client on creation would capture `null` every time.
- **It falls back to `MemoryStore`** when Redis is absent or a command throws.
  `redis.util.ts` is deliberately fail-soft; making the limiter hard-depend on
  Redis would turn a Redis outage into an API outage. `passOnStoreError` was
  rejected — it lets everything through unlimited exactly when a limiter is
  most needed.

**The subtle one:** `MemoryStore` isolated each limiter's buckets for free by
being a fresh instance per `rateLimit()` call. One shared Redis removes that.
The per-account login limiter and the per-account OTP-verify limiter both key
on the same normalised email, so **without distinct prefixes a user's failed
sign-ins would silently spend their password-reset budget.** Every limiter now
carries a prefix and a test pins it. Any new limiter must too.

### The caching helper

`src/utils/cache.util.ts` — `cached(key, ttl, produce)` and
`invalidate(...keys)`.

The property that matters is not speed: **a cache must never be able to fail a
request it only meant to make faster.** No Redis, a throwing read, and a
throwing write all end with the caller getting a real answer. Keys are
namespaced `cache:` so they cannot collide with the `otp:` or socket-ticket
keys — a collision there would be an auth bug, not a cache miss.

Values round-trip through JSON, so cached values must be JSON-safe. A `Date`
returns as a string; a `BigInt` cannot be written at all. See the `Decimal` note
under admin.

### Booking reminder race

Not Redis — a conditional update, which was the cheaper correct answer.

The sweep runs on an in-process cron so every instance runs it. The old sequence
was read `reminderSentAt`, send, then mark: two instances interleave that and
the user gets the notification twice. `BookingRepo.claimReminders` now does
`updateMany` with the null in the `where`, so **the database picks the winner**
and the loser gets `count: 0` and sends nothing. The claim happens _before_ the
notification — that ordering is the fix. The two flags claim independently, so
one instance can win the reminder while another wins the payment nudge.

### First cached reads

| Read                            | Why                                                                                          | TTL    | Invalidated? |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ------------ |
| `CategoryRepo.getAllCategories` | 4 aggregates (3 `groupBy` plus a raw `COUNT(*)` over all services)                           | 5 min  | no           |
| `LocationsSvc.searchCities`     | 5 `distinct` and case-insensitive `contains` across 5 tables, on a typeahead — per keystroke | 10 min | no           |

Both are shared: the same key gives every caller the same answer, so one fill
serves everyone.

### Admin extracted and cached

`admin.controller.ts` held **31 direct `prisma` calls across 18 GET endpoints** —
the heaviest read surface in the API, and the only module with no data layer at
all. Now `admin.repository.ts` (queries, moved verbatim) and `admin.service.ts`
(shaping and caching). **31 → 17 direct calls, and all 17 remaining are writes.**

Why nothing caught this: the architecture validator enforces layer _imports_,
and `prisma` comes from `utils`, which every layer may use. A controller
reaching past its own service to the database trips no rule. The validator is
correct about what it checks; it does not check this.

Caching there, and the two arguments:

- `getStats` — expensive, nobody waiting. 60s, expires, never invalidated.
- the queues — 30s **and** invalidated by writes. An admin resolves a dispute
  and looks straight back at the list; TTL alone would show their own action
  undone, and a console an operator distrusts is worse than a slow one.

Invalidation is hooked to the **12 sites already calling
`announceAdminQueueChanged()`** — the codebase already had a notion of "the
admin queue changed". It is awaited **in the controller**, not inside that
function: the socket announce is deliberately fire-and-forget, and an
un-awaited `DEL` racing the client's immediate refetch is the exact staleness
bug being fixed.

**`totalRevenue` is serialised to a string in the service.** It is a
`Prisma.Decimal`, which cannot survive JSON as itself — left alone the uncached
path would return a Decimal and the cached path a string, making the response
type depend on cache state. A test pins it. **Any Decimal or Date that gets
cached needs the same treatment.**


### The rate limiter could not start without Redis — 9 Sep

Found while checking test output, and worth stating first because it undid §1's
whole point. `RedisStore`'s constructor fires two `SCRIPT LOAD`s and parks the
promises on the instance for the first request to await. With no Redis the
`sendCommand` wrapper rejected immediately, nothing was awaiting those promises
yet, and Node ends the process on an unhandled rejection.

**So the API exited at boot whenever Redis was absent** — the exact outage the
fallback to `MemoryStore` exists to prevent. It was invisible because the test
suite reports unhandled rejections as errors beside a passing run: 156 of them,
next to "24 passed".

`ResilientStore` now builds its `RedisStore` on first use, once there is a
client, and attaches a catch to both parked promises the moment they exist. Two
regression tests pin it: nothing is constructed and nothing is left unhandled
without Redis, and a script load that fails after a client appeared is handled
rather than fatal. Verify by running the API with Redis stopped.

### `Jsonified` — the shape of a cached value, as a type

A cached value has been through JSON, so a `Date` comes back as a string and a
`Prisma.Decimal` as the string its own `toJSON` produced. `res.json()` does the
same to both, so responses never showed it — but an in-process caller that
reaches for `.toISOString()` on a cached value gets a `TypeError`.

The admin dashboard hit this once and it was fixed by hand, by serialising
`totalRevenue` in the service. `cached()` now returns `Jsonified<T>` instead, so
the mistake is a compile error. Turning it on immediately found **seven live
instances**: six in `admin.controller.ts` — the Disputes and Refunds endpoints
threw a 500 on every cache hit within the TTL, which is to say on almost every
load — and one in `booking.controller.ts` that would have reported itself as a
failed confirmation email.

For the type to be true every path has to produce that shape, so a miss
round-trips through JSON too, **including when Redis is absent entirely**. That
buys the property that makes caching safe to spread: a cached read returns the
same shape whether Redis is running or not, so dev and production cannot
disagree about whether a field is a `Date`.

### `versionedCache` — invalidating keys you cannot name

`invalidate` has to name every key it drops. That works for the admin queues,
which are six constants. It does not work for a paginated, filtered, per-user
list: those keys carry a page, a page size, a user id and a hash of the caller's
filters, so the write path cannot enumerate them.

So those keys carry a version and invalidation increments it, retiring an
unbounded key set in one `INCR`. Orphans expire on their own TTLs. The reason
this is the *safer* design and not just the cheaper one: it leaves **one**
invalidation point per namespace to get right, rather than one per key shape.
Costs, both accepted: an extra `GET` per read, and a bump cools other users'
entries too.

### Bookings extracted and cached

`booking.controller.ts`: **21 direct prisma calls → 15, and all 15 are writes.**
The six reads moved out — the cancellation load, the two ticket-code lookups and
the availability pair to `booking.repository`, and the public-template load to
`event-template.repository`, where it always belonged.

Cached, all on the `booking` namespace at a 30s TTL, 5 min for availability:

| Read                 | Key                            | Note                                          |
| -------------------- | ------------------------------ | --------------------------------------------- |
| `getAllBookings`     | `list:<sha256(where)>:<page>:<limit>` | the `where` already carries the viewer scope |
| `getUserBookings`    | `user:<userId>:<page>:<limit>` |                                               |
| `getUpcomingBookings`| `upcoming:<userId>`            |                                               |
| `getBookingById`     | `byId:<id>`                    | viewer filtering applied *after* the cache    |
| `getAvailability`    | `availability:<templateId>`    | the only shared one                           |

Three reads are deliberately **not** cached — `getForCancellation` and the two
ticket-code lookups. Each is read to make a decision (a refund amount, a door
scan) rather than to fill a screen, and bounded staleness is not acceptable in
any of them.

Two things that had to be got right:

- **the expiry sweep stays outside the cache.** `getAllBookings` and
  `getBookingById` both begin with `PaymentRepo.cancelExpiredPayments()`, which
  is a write. Inside the cached block it would stop running on a hit and leave
  expired payments pending for as long as the entry lived.
- **`confirmBooking` invalidates before it re-reads.** It writes payments and
  the booking, then loads the booking for the response and the confirmation
  email. Reading first would show a guest who has just paid an unpaid booking,
  which is how someone pays twice.

**Five other modules write booking rows** — payment (webhook and service),
refund, review, match — so the namespace lives in `utils/cache-namespaces.ts`
rather than in the service. `utils` is importable from every layer and may
import no business layer, so those modules retire the cache without any
service-to-service cycle. All of them now do.

### The controllers stopped holding logic — 9 Sep

The §0b pass, done in one go at the user's direction. Nothing was rewritten:
every query moved with its `where`, `include` and `select` unchanged, and every
flow kept its order of operations, including the parts that look accidental.

Four things are worth knowing about the result.

**Three handlers held most of `booking.controller.ts`** - a template booking, a
cancellation with refunds, and a payment confirmation - each mixing Stripe
calls, escrow rows, emails, notifications and socket announcements with the
request they arrived on. They are `BookingSvc.bookFromTemplate`,
`cancelWithRefunds` and `confirmPayment` now.

**HTTP status codes needed somewhere to live.** Those handlers answered with
404, 409 and 403 directly, and the distinctions are real - "no such ticket",
"already checked in" and "you are not the host" are three different things to
the person holding the phone. `BookingError` carries a status and an optional
code, mirroring `RoleAssignmentError`; the controller maps it and nothing else
knows about HTTP. The alternative was matching on message text, which is how
`checkInBooking` used to do it and why that path still has a fallback.

**Eleven admin decisions collapsed into one shared tail.** Every approval and
rejection did the same four things in the same order - retire the queues,
announce, notify, email - written out eleven times. `AdminSvc.settled()` is
that tail, once. The order it uses is the controller's order and it matters:
the queues are retired *before* anything is announced, because the console
refetches the moment the socket message lands.

**One behavioural difference, deliberate and noted.** `createBooking` announces
from the service now, so the draft-booking path - which shares it and never
announced - emits one extra socket ping telling a client to refetch a list it is
already looking at. Nothing else changed: same queries, same writes, same
emails, same order.

### The flags got fixed — 9 Sep

§3 was a register of thirteen known problems. Twelve are closed; what remains is
in §3 with the reason. The ones with something to say:

**The invalidation moved to the write.** It used to sit in the services, one
call per path, and two writes had already slipped past it - the reminder cron
and the expiry sweep both reached the database without passing a service that
bumped. Both repositories now retire the cache inside the write itself, and the
services that were writing booking rows against `prisma` directly (review,
match, payment, refund) go through them. **No booking-family write bypasses a
repository any more**, which is what makes "cannot be missed" true rather than
aspirational. §0's "caching lives in services, never repositories" still holds
for read-through caching; invalidation is the half that moved, and
`booking.invalidation.spec.ts` pins every write method against it.

**The dashboard stopped loading every booking ever made.** One `aggregate` for
the revenue and the count, one dated `GROUP BY EXTRACT(DOW ...)` for the
thirty-day chart. The day-of-week buckets now come from the database session's
timezone rather than the API process's; those agree in UTC and can differ by one
bucket at the edges of a day when they do not. Verified against the real
database: 19 bookings, ₱1,423,000, all on a Tuesday.

**Every unbounded read got a ceiling.** The five admin queues and the all-
payments list at 500, the review lists at 200, newest-first. These are caps, not
pagination - if a queue ever reaches one, the console needs pagination and a
bigger number will not help. One of them needed more than a `take`: a listing's
rating distribution was tallied from the rows returned, so capping the list
would have quietly redefined the percentages as "of the newest 200". Postgres
counts the distribution now, across all of them.

**The test suite has its own database.** `foxpassportrepublic_test`, pointed at
by a gitignored `.env.test.local` that `tests/env.setup.ts` loads before any
module is imported - which is the only moment that works, because the Prisma
client builds its pool the first time anything imports it. `tests/setup.ts`
refuses to seed unless the database name ends in `_test`, so the failure mode is
a loud error rather than 148 deleted users. **The two specs excluded since 8 Sep
now run**: 313 tests across 27 files, and the development database still has its
148 users afterwards.

**The rate limiter is on express-rate-limit 8 and rate-limit-redis 6.** v6 moved
the `SCRIPT LOAD`s out of the constructor - the boot crash is fixed upstream -
and into an `async init()` that express-rate-limit calls without awaiting, which
is the same unhandled rejection one function along. `ResilientStore` attaches a
catch to whatever `init()` returns; the failure still surfaces at the first
`increment`, where it falls back to memory. Headers were already pinned to
`draft-7`, so v8's default change does not reach the clients.

**A smoke run against the real Redis** - the first in this whole chain of work -
found a regression this pass had just introduced. Reading `REDIS_HOST`/`PORT`
into module constants meant they were read before `dotenv` had run, so `.env`
was ignored and the API connected to *a different Redis on the default port*
and reported success. They are read at connect time again, and the log now names
the address either way. Seven properties verified end to end: read-through
caching, the JSON shape, the TTL, a repository write bumping the version, the
bump retiring keys, and the limiter counting and prefixing in Redis.

**Also gone:** the fabricated `Math.random()` match score on the recommendations
strip (nothing rendered it - the dashboard reads `recommendations.length`); the
211-line unreachable `RefundSvc.cancelAndRefund` and its helper; the dead
`REDIS_TTL_SECONDS` knob; and the `Promise.all` behind the escrow rows, which is
a `$transaction` now.

---

## 2. Next, in order

### a. ~~`booking.controller.ts`~~ — done 9 Sep, see §1

### b. Payment reads — **resume here**

The extraction is done (§0b); the caching is not. `PaymentSvc` has five read
methods and no cached one, and `getBookingPayments` is on the confirmation path.

**Payment status is the one place to be most careful.** A user who has just paid
and sees "unpaid" will pay twice. Either leave payment-status reads uncached or
invalidate them on every webhook and status transition — do not rely on a TTL.

### c. The remaining service reads

**97 `get`/`find`/`list`/`search` methods across the service layer.** Heaviest:
`review` (8), `venue` (6), `users` (6), `follow` (6), `event-template` (6),
`payment` (5).

Work down that list. For each, the questions are which key (include the user id
if the answer is user-specific), what TTL, and whether a write in the same
module has to invalidate it.


### d. ~~The seven stragglers~~ — done 9 Sep, see §0b

### e. ~~The writes, per module~~ — done 9 Sep

Done ahead of the order this section set out, because §0b made it the point
rather than a follow-up. The reads and the writes moved together per module,
which the note in §0b had argued against; it held for `admin`, where the reads
went first on 8 Sep and the writes on 9 Sep, and not for the rest, where a
handler's read and its write were the same twenty lines and splitting them would
have produced two commits that neither made sense alone.

**What is left of that idea is one layer down**: the services now hold 162
direct `prisma` calls. See §3.

---

## 3. Flags — known, not fixed

Thirteen were listed on 9 Sep and twelve are closed (§1). These are what is
left, plus what the fixing turned up.

### The same problem one layer down

**The services hold 146 direct `prisma` calls across 20 files** - it was 162
before this pass moved the booking-family writes into repositories. `passport`
(20), `specialization` (17), `event-template` (16), `review` (13) and `refund`
(13) are the weight, and three modules still have no repository at all:
`passport`, `specialization` and `role-assignment`.

Deliberately not a sweep. A controller holding a query is a layering violation
with a queue behind it; a service holding one is ordinary here, and only becomes
a problem when that query needs caching, testing or reuse. Do it per module, as
each comes up in §2c.

### Reviews attach themselves to an arbitrary booking

Found while routing that module's writes through the repository.
`ReviewSvc.createReview`, given no `bookingId`, takes **the most recently
created event in the entire system** and fabricates a confirmed booking against
it so the review has something to hang off - a real row, with a real user id, in
the bookings table.

Left alone because it is not a caching question and the fix is a product
decision: either reviews require a booking, or they stop pretending to have one.
Both change what the endpoint accepts.

### The caps are not pagination

The admin queues stop at 500 and the review lists at 200 - enough that nothing
in this database comes close, and the queries are bounded, which is what they
were not. But the admin console has no pagination to offer beyond the cap, so a
queue that ever fills it is a screen that silently stops showing rows. The cap
is the bound; pagination is the feature, and it is a UI change.

### Redis remains optional, and silently so

Everything degrades rather than failing: no cache, per-process rate limits, and
one log line naming the address it could not reach. That is deliberate - a Redis
outage must not be an API outage - but it does mean a misconfigured port looks
like a working deployment. The startup log is now the only signal, so it is
worth watching for in staging rather than assuming.

## 4. Verification baseline

As of the end of 9 Sep, on this branch:

- **326 tests / 30 files** pass — the **whole** suite. The two specs that were
  excluded since 8 Sep run again, against a database of their own; the other
  three files came from `main` with PR #78.
- **0 direct `prisma` calls in all 36 controllers** — the §0b check, and the one
  that will regress first.
  `grep -c "prisma\." src/modules/*/*.controller.ts`
- **0 unhandled errors** — there were 156 beside the passing run on 8 Sep, all
  from a boot crash. Watch this number: it is reported next to a green run and
  is easy to read past.
- `tsc --noEmit` clean
- `eslint` 0 errors, 5 pre-existing warnings in the `feed` and `venue` repositories
- architecture scan intact, 184 files
- development database intact: 148 users, 128 venues, 19 bookings

Run with:

```
pnpm exec vitest run
```

No `--exclude` any more. If the suite refuses to start with "Refusing to seed",
the test database is missing - `tests/setup.ts` says how to make one, and
`.env.test.example` is the connection string to copy.

**Verified against a real Redis on 9 Sep** (`local_redis`, port 6378): a
read-through fill and hit, the JSON shape of a cached value, the TTL on the
entry, a repository write bumping the version counter, the bump retiring the
keys formed before it, and the rate limiter counting and prefixing per limiter.
That run is also what caught the API connecting to the wrong Redis - see §1.

**Not verified in a browser.** Nobody has watched a booking page while a payment
lands. That is the remaining gap, and it is the one the whole invalidation
design exists for.
