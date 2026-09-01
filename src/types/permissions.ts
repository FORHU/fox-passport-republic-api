import { SystemRole } from "@prisma/client";

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
  /** May review role applications and change what a user is. */
  "roles:manage",
  /** May create, edit or delete categories. */
  "categories:manage",
  /** May see and act on every booking, not just their own. */
  "bookings:read:all",
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
    "roles:manage",
    "categories:manage",
    "bookings:read:all",
  ],
};

/**
 * Takes a plain string, not a `SystemRole`.
 *
 * Roles arrive from JWT claims and from service signatures that predate the
 * enum, so the boundary accepts anything and answers `false` for values it does
 * not recognise. That is the safe direction: an unknown role is denied rather
 * than defaulted into something. Exhaustiveness is still enforced where it
 * matters — `GRANTS` is keyed by `SystemRole`, so a new role added to the schema
 * fails to compile until it is granted something (or explicitly nothing).
 */
export function can(
  role: string | undefined | null,
  permission: Permission,
): boolean {
  if (!role) return false;
  const grants = GRANTS[role as SystemRole];
  return grants ? grants.includes(permission) : false;
}

/** Everything a role may do — for handing the client its own capability list. */
export function permissionsFor(role: string | undefined | null): Permission[] {
  if (!role) return [];
  return [...(GRANTS[role as SystemRole] ?? [])];
}
