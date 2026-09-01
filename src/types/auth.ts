import { SystemRole, RoleType } from "@prisma/client";

/**
 * Claims we sign into the access token. Kept in sync with `AuthSvc` —
 * anything added here must also be added everywhere `jwt.sign` is called.
 */
export interface AccessTokenClaims {
  userId: string;
  email: string;
  systemRole: SystemRole;
  roleType: RoleType[];
}

/**
 * The verified caller attached to `req.user` by the `authenticate` middleware.
 * Distinct from `AccessTokenClaims`: the claims are whatever the token happens
 * to carry, this is the normalised shape the rest of the app can rely on.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  systemRole: SystemRole;
  roleType: RoleType[];
}

/** Roles accepted by `requireRole` — either a system role or a marketplace role. */
export type AuthorizableRole = SystemRole | RoleType;

/**
 * Every value the enum has, as a lookup.
 *
 * This is deliberately a `Record<SystemRole, true>` and not a string array: the
 * day someone adds a fourth role to the schema, this object stops compiling
 * until it is updated. The previous version of this file narrowed with
 * `claims.systemRole === "admin" ? "admin" : "user"`, which would have silently
 * rewritten a valid `admin_secretary` token to `user` — no error, no log, just
 * a person quietly missing their permissions.
 */
const SYSTEM_ROLES: Record<SystemRole, true> = {
  user: true,
  admin_secretary: true,
  admin: true,
};

/** Unknown or absent roles fall back to the least privileged one. */
function toSystemRole(value: unknown): SystemRole {
  return typeof value === "string" && value in SYSTEM_ROLES
    ? (value as SystemRole)
    : "user";
}

/**
 * Narrows an unverified JWT payload to our claim shape. `jwt.verify` returns
 * `string | JwtPayload`, so the payload is validated rather than cast.
 */
export function toAuthenticatedUser(
  payload: unknown,
): AuthenticatedUser | null {
  if (typeof payload !== "object" || payload === null) return null;

  const claims = payload as Record<string, unknown>;

  const userId = claims.userId;
  const email = claims.email;
  if (typeof userId !== "string" || typeof email !== "string") return null;

  const systemRole = toSystemRole(claims.systemRole);

  const roleType = Array.isArray(claims.roleType)
    ? claims.roleType.filter((r): r is RoleType => typeof r === "string")
    : [];

  return { userId, email, systemRole, roleType };
}
