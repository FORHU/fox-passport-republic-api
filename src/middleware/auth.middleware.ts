import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import jwt from "jsonwebtoken";
import { auth } from "../infrastructure/auth/better-auth";
import { can, Permission } from "../types/permissions";
import { ACCESS_TOKEN_SECRET } from "../config";
import type { SystemRole, RoleType } from "@prisma/client";

/**
 * Authentication Middleware
 * Verifies Better Auth session (Bearer token or cookie) and attaches user info to request.
 * Falls back to legacy JWT verification for existing integration test suites.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session && session.user) {
      req.user = {
        userId: session.user.id,
        email: session.user.email,
        systemRole:
          ((session.user as Record<string, unknown>)
            .systemRole as SystemRole) || "user",
        roleType:
          ((session.user as Record<string, unknown>).roleType as RoleType[]) ||
          [],
      };
      return next();
    }

    // Fallback: verify legacy JWT tokens (used by existing test suites & seed tokens)
    const authHeader = req.headers.authorization;
    const cookieToken =
      (req.cookies && req.cookies.fox_token) ||
      req.cookies?.["better-auth.session_token"];
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7).trim()
        : typeof cookieToken === "string"
          ? cookieToken
          : null;

    if (token) {
      try {
        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as {
          userId: string;
          email: string;
          systemRole?: SystemRole;
          roleType?: RoleType[];
        };
        if (decoded && decoded.userId) {
          req.user = {
            userId: decoded.userId,
            email: decoded.email,
            systemRole: decoded.systemRole || "user",
            roleType: decoded.roleType || [],
          };
          return next();
        }
      } catch {
        // Not a valid JWT token
      }
    }

    return res.status(401).json({
      success: false,
      message: "No token provided or invalid session",
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user info if session exists, but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session && session.user) {
      req.user = {
        userId: session.user.id,
        email: session.user.email,
        systemRole:
          ((session.user as Record<string, unknown>)
            .systemRole as SystemRole) || "user",
        roleType:
          ((session.user as Record<string, unknown>).roleType as RoleType[]) ||
          [],
      };
      return next();
    }

    // Fallback: verify legacy JWT tokens
    const authHeader = req.headers.authorization;
    const cookieToken =
      (req.cookies && req.cookies.fox_token) ||
      req.cookies?.["better-auth.session_token"];
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7).trim()
        : typeof cookieToken === "string"
          ? cookieToken
          : null;

    if (token) {
      try {
        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as {
          userId: string;
          email: string;
          systemRole?: SystemRole;
          roleType?: RoleType[];
        };
        if (decoded && decoded.userId) {
          req.user = {
            userId: decoded.userId,
            email: decoded.email,
            systemRole: decoded.systemRole || "user",
            roleType: decoded.roleType || [],
          };
        }
      } catch {
        // Ignore invalid optional token
      }
    }

    next();
  } catch {
    // Don't fail if token/session is invalid in optional auth
    next();
  }
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
