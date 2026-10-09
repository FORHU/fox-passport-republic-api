#!/usr/bin/env node
/**
 * RBAC guard scan — `RBAC-PLAN.md` Phase 4, items 3 and 5.
 *
 * Two checks, over every `*.routes.ts` file under `src/modules`:
 *
 *   1. **No role-name guards outside `permissions.ts`.** `requireRole`,
 *      `requireAdmin` and `requireHost` are deprecated in favour of
 *      `requirePermission`; a route file that calls any of them directly is a
 *      regression back to the model the RBAC migration removed. This check is
 *      unconditional and fails the build the moment any file uses one —
 *      there is no allow-list, because there is no legitimate reason for a
 *      route file to reach for a role name again.
 *
 *      Not hypothetical: `bidding.routes.ts` and `partnership.routes.ts` both
 *      shipped with `requireRole(...)` on 13 Sep, after `RBAC-PLAN.md` had
 *      already recorded "zero call sites remain" — proof this check would
 *      have caught something that actually happened, not just something that
 *      theoretically could.
 *
 *   2. **Every authenticated route carries a capability check.** A
 *      `router.<verb>()` registration that carries `authenticate` (directly,
 *      or inherited from a preceding `router.use(authenticate)` in the same
 *      file) must also carry `requirePermission(...)`, or appear on the
 *      allow-list below with a reason. This one *is* allow-listed, because
 *      "authenticated but correctly guarded by ownership inside the service,
 *      not by a route-level permission" is a real and common shape here (a
 *      citizen reading their own profile, for instance) — RBAC-PLAN.md §Phase
 *      4 item 5 calls this out explicitly rather than pretending every one of
 *      these is a bug.
 *
 * Run: `node tools/validate-rbac-guards.mjs`
 *
 * Status: check 1 is enforced (exits non-zero on any hit — there is nothing to
 * allow-list). Check 2 is a regression gate against the current audited
 * baseline: it fails when a change adds authenticated routes without a
 * capability check. Use `--report` when deliberately auditing the baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../src/modules");

const REPORT_ONLY = process.argv.includes("--report");
// Existing ownership-guarded routes are tracked separately while the route
// audit is completed. New unguarded routes must not increase this number.
const MAX_UNGUARDED_ROUTES = 180;

/**
 * Routes that are `authenticate`d but deliberately have no `requirePermission`
 * — each entry needs a reason, because an entry with no reason is exactly the
 * kind of thing this scan exists to stop accumulating silently. Keyed as
 * `"<module>.routes.ts <METHOD> <path>"`, matching how violations are printed
 * below so an entry can be copy-pasted from the report straight into here.
 *
 * Empty today, deliberately: no route has been individually re-audited and
 * signed off yet. That is the work `RBAC-PLAN.md` Phase 4 item 5 still owes;
 * this file does not pretend to have done it by shipping a guessed list.
 */
const ALLOW_LIST = new Set([
  // "users.routes.ts GET /:id/profile — self-service, no separate permission needed",

  // Appointments (docs/adr/0005). Audited 24 Sep 2026 when written. Who may
  // act is "owns this one Venue or Event" or "is the person this Appointment
  // names" — both checked in AppointmentService, and neither expressible as a
  // global permission, because the Organizer role deliberately grants none.
  // The person an Appointment names answers or leaves only their own:
  "appointment.routes.ts GET /mine",
  // Only ever describes the caller themselves:
  "appointment.routes.ts GET /access",
  "appointment.routes.ts POST /:appointmentId/accept",
  "appointment.routes.ts POST /:appointmentId/decline",
  "appointment.routes.ts POST /:appointmentId/leave",
  // An Organizer asking to join, checking whether they can, or taking a
  // request back: checked against their own role and request in the
  // service. The Organizer search is limited there to Mayors and Event Owners.
  "appointment.routes.ts GET /join-status",
  "appointment.routes.ts GET /open",
  "appointment.routes.ts GET /organizers",
  "appointment.routes.ts POST /request",
  "appointment.routes.ts POST /:appointmentId/withdraw",
  // Only the Mayor or Event Owner (or an admin holding
  // event:manage-organizers) manages the team:
  "appointment-team.routes.ts GET /",
  "appointment-team.routes.ts POST /",
  "appointment-team.routes.ts DELETE /:appointmentId",
  "appointment-team.routes.ts GET /settings",
  "appointment-team.routes.ts PATCH /settings",
  "appointment-team.routes.ts POST /:appointmentId/approve-request",
  "appointment-team.routes.ts POST /:appointmentId/decline-request",
  // Shared Inbox: who may write is checked per Venue or Event in
  // ConversationService.startInboxConversation (a booking for an Event; the
  // team, via AppointmentAccess, to start one with an attendee).
  "conversation.routes.ts POST /inbox",
  // An Event's Suppliers, for its team to message: checked per Event in
  // ConversationService.listEventSuppliers (`event:message-suppliers` via
  // AppointmentAccess — the Owner and their Organizers).
  "conversation.routes.ts GET /inbox/suppliers",
  // Check-in: authorized per Event by AppointmentAccess.canOnEvent inside
  // BookingSvc — Owner, Organizers, Check-in Helpers, and the staff of the
  // Venue it is held at on the day. A global `booking:check-in` shut all of
  // them but the Owner out.
  "booking.routes.ts PATCH /check-in",
  "booking.routes.ts PATCH /attendees/check-in",
  // One booking: BookingSvc.getBookingForViewer lets in the guest, invited
  // attendees, admins, and the Event's or booked Venue's Owner and staff.
  // No single global permission describes that set.
  "booking.routes.ts GET /:id",
  // Seeing and rejecting bids: checked per Event in BiddingSvc (Owner or
  // Organizers). Accepting still requires `bid:manage` and ownership.
  "bidding.routes.ts GET /service/event/:eventId",
  "bidding.routes.ts PATCH /service/:id/reject",
  "bidding.routes.ts GET /asset/event/:eventId",
  "bidding.routes.ts PATCH /asset/:id/reject",
  // Venue listing and calendar: checked per Venue in VenueSvc — the Mayor, its
  // Organizers (descriptive fields only; `venue:calendar`), or an affiliated
  // Event Foxer for the calendar.
  "venue.routes.ts PUT /:id",
  "venue.routes.ts POST /:id/blocked-dates",
  "venue.routes.ts DELETE /:id/blocked-dates/:date",
  // Venue affiliations: checked per Venue in VenueAffiliationSvc — the mayor
  // or its Organizers; approving one that carries an `agreedPrice` is the
  // mayor's alone.
  "venue-affiliation.routes.ts GET /venue/:venueId",
  "venue-affiliation.routes.ts PATCH /:id/approve",
  "venue-affiliation.routes.ts PATCH /:id/reject",
]);

const BANNED_GUARDS = ["requireRole", "requireAdmin", "requireHost"];
const VERBS = ["get", "post", "put", "patch", "delete"];

function stripComments(src) {
  // RBAC-PLAN.md Phase 4 item 3's own lesson: strip comments before matching,
  // or a comment that mentions `requireRole` (like this file's own docblock)
  // trips the ban it is explaining.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Find the text of every balanced-paren call to `router.<verb>(` or `router.use(`. */
function extractRouterCalls(src) {
  const calls = [];
  const callStart = /router\.(use|get|post|put|patch|delete)\s*\(/g;
  let match;
  while ((match = callStart.exec(src)) !== null) {
    const verb = match[1];
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    calls.push({ verb, args: src.slice(start, i - 1) });
  }
  return calls;
}

function firstStringLiteral(args) {
  const m = args.match(/^\s*["'`]([^"'`]*)["'`]/);
  return m ? m[1] : null;
}

function scanFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const src = stripComments(raw);
  const rel = path.relative(ROOT_DIR, file).split(path.sep).join("/");

  const bannedHits = [];
  for (const guard of BANNED_GUARDS) {
    if (new RegExp(`\\b${guard}\\s*\\(`).test(src)) bannedHits.push(guard);
  }

  const calls = extractRouterCalls(src);
  let fileWideAuth = false;
  const unguarded = [];

  for (const call of calls) {
    if (call.verb === "use") {
      if (/\bauthenticate\b/.test(call.args)) fileWideAuth = true;
      continue;
    }
    const isAuthed = fileWideAuth || /\bauthenticate\b/.test(call.args);
    if (!isAuthed) continue;
    if (/\brequirePermission\s*\(/.test(call.args)) continue;

    const routePath = firstStringLiteral(call.args) ?? "(dynamic path)";
    const key = `${path.basename(file)} ${call.verb.toUpperCase()} ${routePath}`;
    if (ALLOW_LIST.has(key)) continue;
    unguarded.push(key);
  }

  return { rel, bannedHits, unguarded };
}

function main() {
  const files = [];
  for (const mod of fs.readdirSync(ROOT_DIR, { withFileTypes: true })) {
    if (!mod.isDirectory()) continue;
    const dir = path.join(ROOT_DIR, mod.name);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.endsWith(".routes.ts")) files.push(path.join(dir, entry));
    }
  }

  console.log("\x1b[36m🛡️  RBAC guard scan...\x1b[0m");

  let bannedTotal = 0;
  let unguardedTotal = 0;

  for (const file of files) {
    const { rel, bannedHits, unguarded } = scanFile(file);

    for (const guard of bannedHits) {
      bannedTotal++;
      console.error(
        `\x1b[31m[BANNED GUARD]\x1b[0m ${rel} calls ${guard}(...) directly — convert to requirePermission.`,
      );
    }

    for (const key of unguarded) {
      unguardedTotal++;
      console.log(`  \x1b[33m[unguarded]\x1b[0m ${key}`);
    }
  }

  console.log(
    `\nScanned ${files.length} route files. ${bannedTotal} banned-guard hit(s), ${unguardedTotal} authenticated route(s) with no requirePermission and no allow-list entry.`,
  );

  if (bannedTotal > 0) {
    console.error(
      "\x1b[31m✖ Banned role-name guard(s) found in route files — see above.\x1b[0m",
    );
    process.exit(1);
  }

  if (unguardedTotal > MAX_UNGUARDED_ROUTES && !REPORT_ONLY) {
    console.error(
      `\x1b[31m✖ Authenticated route baseline increased: ${unguardedTotal} found, maximum is ${MAX_UNGUARDED_ROUTES}.\x1b[0m`,
    );
    process.exit(1);
  }

  if (unguardedTotal > MAX_UNGUARDED_ROUTES && REPORT_ONLY) {
    console.log(
      "\x1b[33mReport mode: baseline increase is being reported without failing.\x1b[0m",
    );
  }

  console.log("\x1b[32m✅ No banned role-name guards.\x1b[0m");
}

main();
