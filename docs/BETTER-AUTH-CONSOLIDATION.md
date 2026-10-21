# Better Auth consolidation

**Goal:** one sign-in system — Better Auth — across the API, the web app and the
mobile app. Started 20 Oct 2026, branch `feat/better-auth-consolidation`
(matching branch names in each repo as their phase starts).

## Why

Two systems run side by side today, and the seam has already caused an outage:

- The web login form signs in through **Better Auth** (`POST /api/auth/sign-in/email`,
  cookie `better-auth.session_token`). The API's own `/auth/login` (JWT in
  `fox_token`, rotating refresh tokens) is only a fallback — yet the route guard
  checked `fox_token` alone, so on 20 Oct every real user was bounced off
  protected pages on refresh (app #120, fixed in #142).
- The API checks a Better Auth session first on **every** request, then falls
  back to verifying the `fox_token` JWT — the middleware itself calls that path
  "legacy". `AGENTS.md` says Better Auth is the standard and forbids new custom
  JWT logic.
- Sign-in behaviour differs by path: Better Auth keeps one session per device;
  the custom paths (`/auth/login`, Google, Facebook) sign out every other session
  (`revokeAllForUser`).
- Mobile calls `POST /auth/google/mobile` and `/auth/facebook/mobile`, which **do
  not exist** on the API — native social sign-in on mobile cannot work today.

## Current inventory

| Custom today | Where | Better Auth replacement |
|---|---|---|
| `POST /auth/login`, `/auth/register` | API `auth.routes.ts`; web fallback in `useAuth.ts` | `sign-in/email`, `sign-up/email` — web form and mobile **already** use these |
| `POST /auth/refresh-token`, `refresh_tokens` table, `fox_token` / `fox_refresh_token` / `fox_user` cookies | API `refresh-token.service.ts`, `auth.cookies.ts`; web `/api/proxy` refresh-and-replay; mobile `ApiEndpoints.refresh` | Not needed — sessions renew themselves (`session.updateAge`, 1 day; `expiresIn` 7 days) |
| `POST /auth/logout` | API; web | `sign-out` (mobile already uses it) |
| `POST /auth/verify-email`, `/auth/resend-verification-otp` — OTP in `User.otpCode` / `otpExpiry` | API `auth.service.ts`; web; mobile | `emailOTP` plugin, type `email-verification` — OTP kept in `verifications` |
| `POST /auth/forgot-password`, `/auth/reset-password` — OTP | API; web; mobile | `emailOTP` plugin, type `forget-password` |
| `GET /auth/google`, `/google/callback`, `POST /google/exchange` (+ Facebook) — links in `oauth_accounts` | API `google-auth.service.ts`, `facebook-auth.service.ts`; web; mobile | `socialProviders.google` / `.facebook`; mobile native via `signIn.social({ idToken })` — links in `accounts` |
| One session per account (`revokeAllForUser` on sign-in) | API, custom paths only | Dropped — one session per device. Password change/reset uses `revokeOtherSessions` |
| JWT fallback in `authenticate` / `optionalAuth` | API `auth.middleware.ts` | `auth.api.getSession` only (already runs first) |

**Stays ours, on top of Better Auth sessions:**

- `POST /auth/socket-ticket` — the realtime handshake ticket. Unchanged; it just
  reads the Better Auth session through `authenticate`.
- Permissions — still from `GET /profile`, as the web form does today.

**Already compatible:** passwords. Better Auth is configured with bcrypt
(`better-auth.ts`), and every credential user has an `accounts` row with
`providerId: "credential"` (custom register creates it; custom login backfills
it), so existing users can sign in through Better Auth now.

## Phases

Each phase ships on its own; nothing breaks between them. Old endpoints stay
until the cleanup phase, because installed mobile apps keep calling them.

### Phase 1 — API: Better Auth can do everything (old endpoints untouched)

- [x] `emailOTP` plugin: verification and password-reset codes sent through the
      existing `sendTemplatedEmail`, same templates, 6 digits, 5 minutes, 5 tries.
      Its passwordless sign-in and change-email endpoints are switched off
      (`disabledPaths`) — not features this product offers
- [x] `socialProviders` for Google and Facebook from the existing
      `GOOGLE_*` / `FACEBOOK_*` env (only when set); ID-token sign-in for mobile
      native. **Needs, outside the code:** register
      `<BETTER_AUTH_URL>/api/auth/callback/google` and `/callback/facebook` in the
      Google and Meta consoles for each environment
- [x] Account linking for Google/Facebook by verified email — matches today's
      behaviour (see Decisions)
- [x] One-off, idempotent script: copy `oauth_accounts` → `accounts`
      (`providerId` = `google` / `facebook`, `accountId` = `providerAccountId`) —
      `tools/copy-oauth-accounts-to-better-auth.ts [--dry-run]`. **Run it on
      staging before Phase 2 ships**
- [x] ~~`databaseHooks.session.create.after` → login bookkeeping~~ — dropped:
      `updateUserLoginStatus` only bumps `User.updatedAt`, which nothing reads
- [x] Password reset signs out every device (`revokeSessionsOnPasswordReset`)
- [x] Local end-to-end run against Better Auth's endpoints, 12/12: sign up →
      code → verify; two devices stay signed in; sign-in-by-code endpoint 404;
      forgot → code → reset → every device signed out → old password refused,
      new works; seeded user signs in; API `/profile` accepts the session;
      Google sign-in starts. Old `/auth/login` still 200. Suite 1357/1357

### Phase 2 — Web: every auth call goes through Better Auth

- [ ] `useAuth`: drop the `/auth/login` fallback; register, verify, resend,
      forgot, reset, logout through `authClient`
- [ ] Google/Facebook buttons → `authClient.signIn.social`
- [ ] `/api/proxy`: remove refresh-and-replay and the `fox_*` cookies; forward
      the Better Auth cookie only
- [ ] Route guard: Better Auth cookies only — **after** existing `fox_token`
      sessions have had time to expire (refresh TTL), or keep `fox_token` one
      release longer
- [ ] Browser pass on dev.foxpassport.com: sign up, verify, sign in, refresh,
      second device stays signed in, forgot/reset, Google, Facebook, sign out

### Phase 3 — Mobile: same, then release

- [ ] Drop `/auth/refresh-token`; rely on the bearer session token
- [ ] Verify / resend / forgot / reset → `emailOTP` endpoints
- [ ] Native Google/Facebook → `sign-in/social` with the ID token (replaces the
      non-existent `/auth/google/mobile`)
- [ ] Release the new app version

### Phase 4 — API cleanup (once the old mobile version is out of use)

Done early on 21 Oct: the mobile app is unpublished, so there is no old
version to wait for.

- [x] Delete the custom auth routes, `refresh-token.service.ts`,
      `auth.cookies.ts`, the Google/Facebook services and the JWT fallback.
      `/auth` keeps only the socket ticket; sign-out-everywhere deletes Better
      Auth sessions; profile password change/delete use the credential Account
- [x] Migrations: drop `refresh_tokens`, `oauth_accounts` (`User.otpCode` /
      `User.otpExpiry` were already gone)
- [x] Remove `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` from config and
      deploy env; drop `jsonwebtoken`

## Decisions

- **Multiple sessions per account — yes.** One session per device, Better Auth's
  default. Decided 20 Oct (the one-session rule kept signing testers out).
- **Silent Google/Facebook account linking** (`NEXT.md` §3, open): today a Google
  sign-in with an existing email links to that account silently. Phase 1 keeps
  that behaviour so nothing changes for users; revisit separately.

## Risks

- **Social links not copied** → those users cannot sign in with Google/Facebook.
  The copy script runs before Phase 2 ships, and is checked by count.
- **Installed mobile apps** keep calling custom endpoints until updated — hence
  Phase 4 waits.
- **Cookie switch-over** → anyone with only a `fox_token` session is signed out
  once the guard stops accepting it. Acceptable on staging; on production, wait
  out the refresh TTL first.
