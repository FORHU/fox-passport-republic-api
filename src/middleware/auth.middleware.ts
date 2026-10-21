import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../infrastructure/auth/better-auth";
import { can, Permission } from "../types/permissions";
import type { SystemRole, RoleType } from "@prisma/client";

/**
 * The signed-in user behind this request, from the Better Auth session —
 * `Authorization: Bearer <session token>` (mobile, the web proxy) or the
 * session cookie. Null when there is none, or it has expired or been revoked.
 */
async function sessionUser(req: Request): Promise<Request["user"] | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session?.user) return null;
  const user = session.user as Record<string, unknown>;
  return {
    userId: session.user.id,
    email: session.user.email,
    systemRole: (user.systemRole as SystemRole) || "user",
    roleType: (user.roleType as RoleType[]) || [],
  };
}

/** Requires a signed-in user; answers 401 otherwise. */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await sessionUser(req);
    if (user) {
      req.user = user;
      return next();
    }
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired session" });
  }
};

/** Attaches the user when there is one; never refuses the request. */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const user = await sessionUser(req);
    if (user) req.user = user;
  } catch {
    // An unreadable session on an optional route is just "signed out".
  }
  next();
};

/**
 * Gate on a capability rather than on who the caller is.
 *
 * `requireAdmin` answers "are you the admin role?", which stopped being the
 * right question when `admin_secretary` arrived: it works the approval queues
 * but must not reach the citizens list. Guarding the capability means adding a
 * role is a change to one grant table, not an audit of every call site.
 */
/**
 * Marks a guard with the permissions it checks, so the route-matrix test
 * (tests/rbac.route-matrix.spec.ts) can find every protected route and what
 * it needs by walking the mounted app — no hand-kept list to drift.
 */
export const REQUIRED_PERMISSIONS = Symbol("requiredPermissions");

function tagGuard<T extends object>(guard: T, permissions: Permission[]): T {
  return Object.assign(guard, { [REQUIRED_PERMISSIONS]: permissions });
}

export const requirePermission = (permission: Permission) => {
  const guard = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }
    // The whole user, not `req.user.systemRole`: a bare role string is answered
    // from the SystemRole table alone, so passing one here would deny every
    // supply-side capability to the people who actually hold it.
    if (!can(req.user, permission)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to do that",
      });
    }
    next();
  };
  return tagGuard(guard, [permission]);
};

/**
 * `requirePermission`'s sibling for a route two different capabilities can
 * satisfy — e.g. `service.routes.ts`'s create/update/delete, which
 * `service:manage` (serviceFoxer) or `performer:manage` (performerFoxer) both
 * unlock, since both own rows of the same `Service` model. Kept separate from
 * `requirePermission` rather than adding a second overload, so its ~15
 * existing single-permission call sites are untouched.
 */
export const requirePermissionAny = (permissions: Permission[]) => {
  const guard = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }
    if (!permissions.some((permission) => can(req.user, permission))) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to do that",
      });
    }
    next();
  };
  return tagGuard(guard, permissions);
};
