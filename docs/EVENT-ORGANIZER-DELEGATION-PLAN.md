# Event Organizer delegation: implementation plan

**Status:** In progress
**Scope:** `event`, `event-organizer` (new), `booking` modules (api); `creator-dashboard/events` (app)
**Prepared:** 12 Sep 2026
**Branch:** `feat/event-organizer-delegation` (both repos)

## Why

"Tackle Event Foxer's event organizer role" turned out, after clarification, to mean something specific: **the Event Foxer who owns an event should be able to name someone else who can check guests in at the door for that one event** — not a new marketplace-wide role, not a KYC-lite signup flow. Three other candidate features surfaced during scoping (a dedicated Event Foxer page/space, `PRIORITIES.md` P2's still-undecided platform-wide "Event Operator" role, and the unbuilt community-roster concept in `roles-and-spaces.md`) and are explicitly **not** this task — see "Out of scope" below.

This is a real, well-defined gap, not a green-field guess:

- `Event.organizerId` already exists (`prisma/schema/event.prisma`), with the Prisma relation literally named `"EventOrganizer"` — but it's set once at event creation (`host: { connect: { id: template.ownerId } }` in `event-request.service.ts`) and never reassignable. It's always the Event Foxer who owns the template.
- Every check-in authorization check in `booking.service.ts` was a **strict equality** against that single `organizerId`. Only the exact owning Event Foxer could check anyone in — no delegation existed at all.
- `organizerId` is also read for approval rights (`event-request.service.ts`), review eligibility (`review.service.ts`), feed posting (`feed.service.ts`), and match requests (`match.service.ts`) — an overloaded field carrying several kinds of authority. Reassigning it directly would incorrectly hand a delegate approval rights, review eligibility, etc. **This is why the fix is a new, narrow delegation table, not repointing `organizerId`.**
- The scanner page (`creator-dashboard/check-in`) is already gated by login only, not by the `booking:check-in` permission — the API enforces the permission on the write. So a delegate can already load the scanner UI today; the only real gaps were the API's hard-coded owner check and a way to actually name a delegate.

## Scope decisions

- **Per-`Event`, not per-`EventTemplate`.** A recurring series can hand different instances to different volunteers. ("Always the same person for every event from this template" is a fast-follow, not built now.)
- **Authority = check-in only**, and specifically only the `completed`-via-check-in status transition inside `booking.service.ts`'s `updateStatus` — **not** cancellation, which stays owner-only. Also not touched: approving event requests, review eligibility, feed posting as the event, match requests, payouts, XP.
- **Permissions are per-assignment, not fixed** — `EventOrganizerAssignment.permissions: String[]` (mirrors mapanytime's `SellerOrganizationMembers.permissions` pattern), validated against a small code-level allow-list (`DELEGABLE_EVENT_PERMISSIONS` in `src/types/permissions.ts`, currently just `["booking:check-in"]`). Growing what's delegable later is a one-line addition to that constant, not a schema change.
- **No new `RoleType`/permission, no JWT changes.** Delegates don't become a marketplace-visible role and don't get a platform-wide `booking:check-in` grant. Authorization is resolved per-request against the new table.
- **Assignment by email, self-serve, instant.** The Event Foxer (or admin) adds a delegate by email; no application, no review queue.

## Steps and status

- [x] **Step 0 — commit the pending checkpoint.** App repo had a large finished-but-uncommitted diff (the `middleware.ts` → `proxy.ts` rename + seven protected-route-tree guards from `TOMORROW.md` §0·0aa/§3). Verified `pnpm test` 144/144 green, committed to `main` on its own, before branching for this feature.
- [x] **Step 1 — schema.** Added `EventOrganizerAssignment` to `prisma/schema/event.prisma` (`eventId`, `userId`, `assignedById`, `permissions: String[] @default(["booking:check-in"])`, unique on `(eventId, userId)`), plus the two inverse relations on `User` in `identity.prisma`. Migration `20260912100107_add_event_organizer_assignment` generated and applied locally.
- [x] **Step 2 — backend module.** `src/modules/event-organizer/` (repository, service, controller, routes) following the `reports/` module's four-file shape. Mounted at `GET/POST /v1/events/:eventId/organizers` and `DELETE /v1/events/:eventId/organizers/:userId` via `event.routes.ts`. Ownership check is inline in the service (`event.organizerId === callerId || can(callerSystemRole, "queue:read")`), matching `event-request.service.ts`'s existing style rather than the unused `requireOwnerOrAdmin` middleware.
- [x] **Step 3 — loosen check-in authorization.** `booking.service.ts`'s four organizer-equality sites now go through `EventOrganizerRepo.isAuthorized(eventId, userId, "booking:check-in")`: `checkInAndSettle`, `checkInByTicketCode`, `checkInAttendeeByTicketCode` outright, and `updateStatus` conditionally — **only** when the target status is `completed` (the check-in path), so a check-in-only delegate cannot cancel a booking through the same shared method. `event-request.service.ts`, `review.service.ts`, `feed.service.ts`, and `match.service.ts`'s own `organizerId` checks are deliberately untouched.
- [x] **Step 4 — notification on assignment.** `EventOrganizerService.assign` fires `NotificationService.create(...)` (`event_organizer_assigned`) linking to `/creator-dashboard/check-in`, matching the `role-request.service.ts` approve/reject pattern.
- [x] **Step 5 — frontend (app repo).** Completed: API helpers in `events.ts` (`fetchEventOrganizers`, `addEventOrganizer`, `removeEventOrganizer`), and `EventOrganizersSection.tsx` integrated into `EventEditClient.tsx` (`creator-dashboard/events/[id]/edit`) to assign and revoke delegates by email for scheduled events.
- [x] **Verification.** Vitest coverage in `tests/event-organizer.spec.ts` (7/7 passing) and `tests/booking.checkin.spec.ts` (5/5 passing). Frontend unit suite 144/144 passing. Architecture isolation rules verified at baseline 26 violations without boundary regression.

## Out of scope (found during research, deliberately not this task)

- Widening delegate authority to approvals/reviews/match/feed.
- `PRIORITIES.md` P2's still-undecided platform-wide "Event Operator" role.
- Event Foxer's own dedicated page/space (`roles-and-spaces.md` §5).
- The unbuilt community-roster concept (`roles-and-spaces.md` §3).
- A "same organizer for every event from this template" convenience default.
- Surfacing "events you organize" in the delegate's own dashboard/profile — v1 gap, not a blocker, since the assignment notification links straight to check-in.
