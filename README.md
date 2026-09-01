# Fox Passport Republic — API

The backend for Fox Passport Republic, an event-booking marketplace. Citizens
book Events, and the Venues, Assets and Services attached to them, that
EventFoxers assemble out of inventory supplied by VenueFoxers, GearFoxers and
ServiceFoxers.

Node.js + TypeScript, **Express** over **PostgreSQL via Prisma**. Serves the
Next.js client in `../fox-passport-republic-app`.

> The domain vocabulary is defined in [`CONTEXT.md`](./CONTEXT.md) and mirrors
> the `RoleType` / `SystemRole` enums in `prisma/schema.prisma`. Architectural
> decisions live in [`docs/adr/`](./docs/adr/).

---

## Stack

| Concern | What we use |
|---|---|
| HTTP | Express 4, `cors`, `helmet`, `express-rate-limit` (1000 req / 15 min, disabled in dev), `express-validator` |
| Database | PostgreSQL through **Prisma** (`@prisma/client` + `@prisma/adapter-pg`) |
| Auth | JWT access + refresh tokens; bcrypt (cost 12) with transparent re-hashing of legacy PBKDF2 hashes |
| Real-time | Socket.io — `src/infrastructure/socket/`, authenticated on the handshake, one private room per `userId` |
| Cache | Redis — `src/utils/redis.util.ts` |
| Media | AWS S3 presigned uploads — `src/utils/s3.ts`, optionally fronted by CloudFront |
| Payments | Stripe, including Connect onboarding and payouts. The webhook route takes a **raw body** and is mounted before the JSON parser (`src/app.ts:47`) |
| Mail | Nodemailer / Resend — `src/utils/mailer.ts`, `src/utils/resend.ts` |
| Tests | Vitest — specs in `tests/`, not colocated |

---

## Project structure

```
prisma/
  schema.prisma        Single source of truth for the data model and enums
  migrations/          Applied with `prisma migrate`; never edit by hand
  seed.ts              `pnpm exec prisma db seed`
src/
  server.ts            Process entry — binds the port, starts Socket.io
  app.ts               Express app: CORS, raw Stripe body, JSON, rate limit, helmet, routes, error handler
  routes/index.ts      Mounts every resource under `/api/v1/*`
  controllers/         HTTP in, HTTP out. No business logic
  services/            Business logic. Where the interesting code is
  repositories/        Prisma queries
  middleware/          `auth.middleware.ts` — JWT decode, `requireRole`, `requireOwnerOrAdmin`
  infrastructure/      Socket.io gateway and server
  modules/             Self-contained feature modules (currently `notifications`)
  utils/               prisma client, password, s3, redis, mailer, pricing, otp, enums
  config.ts            Reads and validates environment variables
tests/                 Vitest specs (`*.spec.ts`)
```

Request path: `routes → controller → service → repository → Prisma`. Controllers
should not touch Prisma directly.

---

## Running locally

Requires Node.js, pnpm, and a PostgreSQL instance. Redis is needed for anything
that caches; the rest of the API runs without it.

```bash
pnpm install
cp .env.example .env      # then fill it in — see below
pnpm exec prisma generate
pnpm exec prisma migrate dev
pnpm exec prisma db seed  # optional
pnpm dev                  # http://localhost:6002
```

`pnpm dev` frees port 6002 first, then runs `nodemon` over `src/`.

Prefer containers? [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) brings up Postgres,
Redis and the API together and is kept accurate.

### Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Kill port 6002, then watch-run `src/server.ts` |
| `pnpm build` | `prisma generate` then `tsc` |
| `pnpm start` | Run the compiled server from `dist/` |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest, watching |
| `pnpm lint` | ESLint with `--fix` |
| `pnpm format` | Prettier over `src/` |
| `pnpm db:setup` | `prisma generate` + `prisma migrate dev` |
| `pnpm kill` | Free port 6002 |

---

## Configuration

All environment variables are read through `src/config.ts`. `.env*` is
gitignored — **changes there are local only**, so anything new must also reach
teammates and deployed environments.

**Required**

| Variable | Notes |
|---|---|
| `PORT` | Defaults to 6002 |
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/foxpassportrepublic` |
| `ACCESS_TOKEN_SECRET` | Must be **byte-identical** to the app's `ACCESS_TOKEN_SECRET` — the Next proxy verifies tokens this API signed. If they differ, every protected route in the app redirects to `/` |
| `REFRESH_TOKEN_SECRET` | Separate secret for refresh tokens |
| `ACCESS_TOKEN_EXPIRY` | e.g. `15m` |
| `REFRESH_TOKEN_EXPIRY` | e.g. `7d`. Cookie lifetimes are derived from this |
| `SECRET_KEY` | General-purpose signing secret |
| `CORS_ORIGIN` | `http://localhost:6001` |
| `FRONTEND_URL` | `http://localhost:6001`. Stripe Connect return/refresh URLs default off this |
| `NODE_ENV` | `development` disables rate limiting |

**Per integration** — only needed if you are touching that feature:

- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TTL_SECONDS`
- S3: `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `CLOUD_FRONT_DOMAIN`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`
- Mail: `MAILER_EMAIL`, `MAILER_PASSWORD`, `MAILER_TRANSPORT_HOST`, `MAILER_TRANSPORT_PORT`, `MAILER_TRANSPORT_SECURE`, `RESEND_API_KEY`
- Pricing: `PLATFORM_FEE_PERCENT`

---

## API surface

Everything is mounted under `/api/v1`. Sub-routes are registered before generic
`:id` paths so they are not swallowed by them.

```
auth            users           profile         role-requests
categories      venues          asset           service
asset/bookings  service/bookings                bookings
event-templates event-requests  event-transactions
payments        stripe-connect  files           notifications
reviews         favorites       matches         waitlist
cancellation-policies           locations       passport
analytics       search
```

`GET /api/health` is the liveness check. An unmatched `/api/*` path returns a
404 from the catch-all in `src/app.ts:86`.

---

## Auth model

- **`SystemRole`** — `user` | `admin`. Platform administration.
- **`RoleType`** — `venueFoxer` | `eventFoxer` | `gearFoxer` | `serviceFoxer` |
  `investor`. Additive: a user holds zero or more *alongside* being a citizen.

Access tokens are stateless JWTs. Refresh tokens are recorded in the
`RefreshToken` table by **jti only** — enough to revoke, useless to anyone who
reads the table. Consequences worth knowing before you debug something:

- `POST /auth/logout` genuinely revokes; a logged-out refresh token returns 401.
- Password login calls `revokeAllForUser` first, so **one account can hold one
  session**. Signing in on a second device ends the first. **Google sign-in does
  not do this** — `GoogleAuthSvc.handleCallback` issues a refresh token without
  revoking, so a Google sign-in leaves existing sessions alive. The two paths
  disagree; which way it should resolve is an open decision, not a settled one.
- Password change and password reset both revoke every session, including the
  caller's.
- A jti that is not in the table is invalid, so tokens minted before the table
  existed do not work.
- An access token already issued survives until it expires (`ACCESS_TOKEN_EXPIRY`);
  nothing consults a revocation list per request. It just cannot renew.

### Google sign-in

A second way to obtain a session, over three requests:

| Step | Route | Notes |
|---|---|---|
| 1 | `GET /auth/google` | Redirects to Google. Mints a `state` and stores it in the httpOnly `g_oauth_state` cookie — `SameSite=Lax`, because `Strict` would be stripped on the top-level return from Google. |
| 2 | `GET /auth/google/callback` | Rejects the callback unless the echoed `state` matches that cookie (constant-time), then requires `email_verified` on Google's ID token before linking or creating anything. Redirects to the app with `?xc=<opaque code>` — **never with tokens**. |
| 3 | `POST /auth/google/exchange` | Redeems `xc` for the token pair. Called server-side by the app, once: `getDel` makes it atomic and single-use, and the entry lives 60 seconds. |

Two consequences worth knowing before you debug it:

- **Google sign-in requires Redis.** Step 2 parks the session there. Redis is
  optional elsewhere in this app; here sign-in fails rather than falling back to
  putting a refresh token in a URL.
- A Google identity is linked to an existing password account with the same
  **verified** address, with no confirmation from the account holder.

---

## Migrations

`prisma/schema.prisma` is the source of truth; `prisma migrate` writes the SQL.

- Local: `pnpm exec prisma migrate dev`
- Deployed: `pnpm exec prisma migrate deploy` — it can never prompt to reset
- Check for drift: `pnpm exec prisma migrate diff`

Schema-dependent code and its migration must land in the same commit. They did
not once, and because the login controller turned every error into
`401 Invalid credentials`, a missing table presented as a wrong password. Both
halves of that are fixed; the lesson stands.

---

## Testing

```bash
pnpm test
```

Vitest, Node environment, specs in `tests/**/*.{test,spec}.ts` — see
`vitest.config.ts`. They do not need a database.
