import { RoleType, SystemRole } from "@prisma/client";

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
  /** May review role applications and change what a user is. */
  "roles:manage",
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
  /** May build, submit, match and edit an event template. */
  "template:manage",
  /** May scan a ticket at the door. Held by event hosts *and* admins. */
  "booking:check-in",
  /** May start Stripe Connect onboarding to receive payouts. */
  "payouts:onboard",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

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
    "categories:manage",
    "policies:manage",
    "bookings:read:all",
    "payments:read:all",
    "disputes:resolve",
    "refunds:manage",
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
  gearFoxer: ["asset:manage", "payouts:onboard"],
  serviceFoxer: ["service:manage", "payouts:onboard"],
  eventFoxer: ["template:manage", "booking:check-in", "payouts:onboard"],
  // Applies and is approved, and has nothing to manage yet.
  investor: [],
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
