import { RoleType, ServiceCategory, SystemRole } from "@prisma/client";

/**
 * What a caller is allowed to do, named by the action rather than by who they
 * are.
 *
 * Before this, "can they do it?" was answered 26 different times across both
 * repos as `systemRole === "admin"`, which meant adding a third role was an
 * audit rather than a configuration change — and the first thing a reader had
 * to work out at each site was *which* admin capability was actually being
 * guarded. Naming the capability makes that obvious and puts the answer in one
 * table.
 */
export const PERMISSIONS = [
  /** May reach the admin console at all. */
  "admin:access",
  /** May see the submission queues — venues, assets, services, templates, events. */
  "queue:read",
  /** May approve or reject a submission. */
  "queue:decide",
  /** May see the citizens list and individual user records. */
  "users:read",
  /** May create, edit or delete a user. */
  "users:manage",
  /** May review role applications. */
  "roles:manage",
  /**
   * May change what a person *is* — their `SystemRole`, and their `RoleType`s
   * as an admin override of the application flow.
   *
   * Separate from `roles:manage`, which reviews applications people submit.
   * This one hands out capability directly, so it is the narrowest grant in the
   * table: `admin` only. A role that can promote itself is not constrained.
   */
  "roles:assign",
  /** May create, edit or delete categories. */
  "categories:manage",
  /** May create, edit or delete cancellation policies. */
  "policies:manage",
  /** May see and act on every booking, not just their own. */
  "bookings:read:all",
  /** May see the global payments listing. */
  "payments:read:all",
  /** May work the disputes queue and resolve a dispute. */
  "disputes:resolve",
  /** May issue, retry and resolve refunds. */
  "refunds:manage",
  /** May manage event delegates as a system administrator. */
  "event:manage-organizers",
  /** May create, edit, deactivate and preview platform fee rules (`PlatformFeeConfig`). */
  "fees:manage",

  // ── The supply side ───────────────────────────────────────────────────
  // Held through `RoleType`, not through `SystemRole`. Deliberately *not*
  // granted to `admin`: an admin cannot create a venue or an event template
  // today, and turning a role-name guard into a permission must not quietly
  // change that. `booking:check-in` is the one exception, and it is spelled
  // out below.
  /** May create, edit or delete a venue. */
  "venue:manage",
  /** May create, edit or delete an asset listing. */
  "asset:manage",
  /** May create, edit or delete a service listing. */
  "service:manage",
  /** May create, edit or delete a performer-category service listing (photography, DJ, live band, MC, etc). */
  "performer:manage",
  /** May build, submit, match and edit an event template. */
  "template:manage",
  /** May scan a ticket at the door. Held by event hosts *and* admins. */
  "booking:check-in",
  /** May start Stripe Connect onboarding to receive payouts. */
  "payouts:onboard",
  /** May view and accept/reject bids submitted against one's own event. */
  "bid:manage",
  /** May submit a service bid against an event's open slot. */
  "bid:submit-service",
  /** May submit an asset (gear) bid against an event's open slot. */
  "bid:submit-asset",
  /** May propose a partnership (sponsorship, investment, etc.). */
  "partnership:propose",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Which `ServiceCategory` values are owned by `performerFoxer` rather than
 * `serviceFoxer`. This list — not a schema flag — is what answers "is this
 * category performer-owned," at every ownership/XP/review call site that
 * used to hardcode `serviceFoxer` for every `Service` row.
 *
 * `entertainment` is included for the sake of existing rows (paused by the
 * `20260914120000_add_performer_foxer_role` migration until their owner is
 * approved as `performerFoxer`) but is not offered as a category for new
 * listings — new performer supply uses the granular values below.
 */
export const PERFORMER_SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  "entertainment",
  "photography",
  "videography",
  "dj",
  "live_band",
  "mc",
] as const;

export const isPerformerServiceCategory = (
  category: ServiceCategory,
): boolean =>
  (PERFORMER_SERVICE_CATEGORIES as readonly string[]).includes(category);

/** The `RoleType`/`UserPath` a `Service` row's provider should resolve to,
 * given its category — `performerFoxer` for performer categories,
 * `serviceFoxer` otherwise. Centralizes the branch used by ownership checks,
 * XP awards on approval/booking-completion, and review-bonus resolution, so
 * it isn't reimplemented at each call site. */
export const resolveServiceProviderRole = (
  category: ServiceCategory,
): Extract<RoleType, "serviceFoxer" | "performerFoxer"> =>
  isPerformerServiceCategory(category) ? "performerFoxer" : "serviceFoxer";

/**
 * Permissions an Event Foxer may delegate to someone else for a single event,
 * via `EventOrganizerAssignment.permissions` — not a `RoleType` grant, and not
 * visible to `can()`/`permissionsForUser()` at all. Scoped entirely to that
 * one event: approving requests, reviews, payouts and XP still key off
 * `Event.organizerId` alone regardless of what a delegate holds here.
 *
 * Keeping this as an explicit allow-list (rather than accepting any
 * `Permission`) means a new delegable capability is a deliberate code change,
 * not an accident of some other permission existing in the main table.
 */
export const DELEGABLE_EVENT_PERMISSIONS = ["booking:check-in"] as const;
export type DelegableEventPermission =
  (typeof DELEGABLE_EVENT_PERMISSIONS)[number];

/**
 * The grant table.
 *
 * `admin_secretary` exists to work the approval queues without seeing who
 * anyone is: no citizens list, no role applications, no category management.
 * That is the whole point of the role, so those three are the ones deliberately
 * absent rather than merely unlisted.
 */
const GRANTS: Record<SystemRole, readonly Permission[]> = {
  user: [],
  admin_secretary: ["admin:access", "queue:read", "queue:decide"],
  admin: [
    "admin:access",
    "queue:read",
    "queue:decide",
    "users:read",
    "users:manage",
    "roles:manage",
    "roles:assign",
    "categories:manage",
    "policies:manage",
    "bookings:read:all",
    "payments:read:all",
    "disputes:resolve",
    "refunds:manage",
    "event:manage-organizers",
    "fees:manage",
    // The only supply-side permission an admin holds, because the guard it
    // replaces — `requireHost` — was `["eventFoxer", "admin"]`. Every other
    // `venue:` / `asset:` / `service:` / `template:` / `payouts:` capability
    // was closed to admins before this table existed and stays closed.
    "booking:check-in",
  ],
};

/**
 * The grant table for `RoleType` — the supply side, and a user may hold several.
 *
 * This is the second half of the same model, not a second model: both tables
 * feed one resolver, `permissionsForUser`, and one answer. Before it, 25 routes
 * authorised on a role name through `requireRole` while the rest went through a
 * permission — the "two competing authorization mechanisms" the architecture
 * spec warns against.
 *
 * Typed `Record<RoleType, …>` for the same reason as `GRANTS`: a sixth
 * `RoleType` fails to compile until someone decides what it may do.
 */
const ROLE_TYPE_GRANTS: Record<RoleType, readonly Permission[]> = {
  venueFoxer: ["venue:manage", "payouts:onboard"],
  gearFoxer: ["asset:manage", "payouts:onboard", "bid:submit-asset"],
  serviceFoxer: ["service:manage", "payouts:onboard", "bid:submit-service"],
  // Owns performer-category Service rows (see PERFORMER_SERVICE_CATEGORIES
  // below) — a subset of the same `Service` model serviceFoxer owns, not a
  // separate catalog entity. Shares `bid:submit-service` since performer
  // items ride the same EventTemplateService/EventServiceBid path.
  performerFoxer: ["performer:manage", "payouts:onboard", "bid:submit-service"],
  eventFoxer: [
    "template:manage",
    "booking:check-in",
    "payouts:onboard",
    "bid:manage",
  ],
  // No longer "nothing to manage" — proposing a partnership was previously
  // gated with `requireRole(["investor"])` on the route directly.
  investor: ["partnership:propose"],
};

/**
 * Who is being asked about.
 *
 * A user holds one `SystemRole` and any number of `RoleType`s, so the complete
 * subject is both. The bare-string form is kept because roles arrive from JWT
 * claims and from service signatures that predate the enum — and it answers
 * from `GRANTS` alone, deliberately.
 */
export interface AuthorizationSubject {
  systemRole?: string | null;
  roleType?: readonly string[] | null;
}

export type PermissionSubject =
  string | null | undefined | AuthorizationSubject;

const systemGrants = (
  role: string | null | undefined,
): readonly Permission[] => (role ? (GRANTS[role as SystemRole] ?? []) : []);

const supplyGrants = (role: string): readonly Permission[] =>
  ROLE_TYPE_GRANTS[role as RoleType] ?? [];

/**
 * The authorization question, asked one way for the whole system.
 *
 * A **bare string means `SystemRole`, and only that.** `can("admin",
 * "template:manage")` is `false`: a role name carries no `RoleType`, and
 * pretending otherwise would hand every administrator every supply capability
 * the first time someone passed a string by habit. Only a complete subject can
 * be answered from the supply table.
 *
 * Unknown values answer `false` rather than throwing or defaulting — an
 * unrecognised role is denied, never promoted. Exhaustiveness is enforced where
 * it can be: both grant tables are keyed by their enum, so a new role fails to
 * compile until it is granted something, or explicitly nothing.
 */
export function can(
  subject: PermissionSubject,
  permission: Permission,
): boolean {
  if (!subject) return false;

  if (typeof subject === "string")
    return systemGrants(subject).includes(permission);

  if (systemGrants(subject.systemRole).includes(permission)) return true;

  return (subject.roleType ?? []).some((role) =>
    supplyGrants(role).includes(permission),
  );
}

/**
 * Everything a `SystemRole` may do. The lower-level helper — prefer
 * `permissionsForUser` for anything describing a person.
 */
export function permissionsFor(role: string | undefined | null): Permission[] {
  return [...systemGrants(role)];
}

/**
 * The canonical resolver: everything a *person* may do, both inputs merged.
 *
 * This is what stamps the token claim and what `/profile` returns, so the app
 * can hide a control the server would refuse. The server never reads that list
 * back — `can()` re-derives from the role claims on every request, which is why
 * a tampered `permissions` array grants nothing.
 */
export function permissionsForUser(
  subject: AuthorizationSubject,
): Permission[] {
  const granted = new Set<Permission>(systemGrants(subject.systemRole));
  for (const role of subject.roleType ?? []) {
    for (const permission of supplyGrants(role)) granted.add(permission);
  }
  return [...granted];
}
