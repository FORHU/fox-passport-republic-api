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

  const systemRole: SystemRole =
    claims.systemRole === "admin" ? "admin" : "user";

  const roleType = Array.isArray(claims.roleType)
    ? claims.roleType.filter((r): r is RoleType => typeof r === "string")
    : [];

  return { userId, email, systemRole, roleType };
}
