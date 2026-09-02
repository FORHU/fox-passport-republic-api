import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../config";
import { AuthorizableRole, toAuthenticatedUser } from "../types/auth";
import { can, Permission } from "../types/permissions";

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7).replace(/"/g, ""); // Remove 'Bearer ' and any accidental quotes

    const user = toAuthenticatedUser(jwt.verify(token, ACCESS_TOKEN_SECRET));
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = user;

    next();
  } catch (e: unknown) {
    const error = e as Error;
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user info if token exists, but doesn't require it
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).replace(/"/g, "");
      const user = toAuthenticatedUser(jwt.verify(token, ACCESS_TOKEN_SECRET));
      if (user) req.user = user;
    }

    next();
  } catch {
    // Don't fail if token is invalid in optional auth
    next();
  }
};

/**
 * Role-Based Access Control Middleware
 * Checks if the user has the required SystemRole or any of the required RoleTypes
 *
 * @param allowedRoles - Array of allowed roles (can be SystemRole or RoleType)
 */
export const requireRole = (allowedRoles: AuthorizableRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { systemRole, roleType } = req.user;

    // Check if user has required SystemRole or any required RoleType
    const hasSystemRole = allowedRoles.includes(systemRole);
    const hasRoleType = roleType.some((role) => allowedRoles.includes(role));

    if (!hasSystemRole && !hasRoleType) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
        requiredRoles: allowedRoles,
      });
    }

    next();
  };
};

/**
 * Check if user is an admin.
 *
 * Note: `SystemRole` is only `user | admin` — there is no `super_admin` tier.
 * A previous `requireSuperAdmin` guarded against a role no user could hold,
 * so every request it protected was rejected.
 */
/**
 * Gate on a capability rather than on who the caller is.
 *
 * `requireAdmin` answers "are you the admin role?", which stopped being the
 * right question when `admin_secretary` arrived: it works the approval queues
 * but must not reach the citizens list. Guarding the capability means adding a
 * role is a change to one grant table, not an audit of every call site.
 */
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
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
};

/**
 * @deprecated Prefer `requirePermission`. Kept for routes not yet converted;
 * note that it excludes `admin_secretary` by design, so a queue route guarded
 * with this will lock the secretary out.
 */
export const requireAdmin = requireRole(["admin"]);

/**
 * Check if user can act as an event host (EventFoxer) or is an admin
 */
export const requireHost = requireRole(["eventFoxer", "admin"]);

/**
 * Resource Owner or Admin Middleware
 * Allows access if user owns the resource OR is an admin
 *
 * @param getUserIdFromRequest - Function to extract owner ID from request
 *
 * @example
 * router.put('/:id', authenticate, requireOwnerOrAdmin((req) => req.params.userId), updateUser)
 */
export const requireOwnerOrAdmin = (
  getUserIdFromRequest: (req: Request) => string,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const ownerId = getUserIdFromRequest(req);
    const isOwner = req.user.userId === ownerId;
    const isAdmin = can(req.user.systemRole, "users:read");

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only access your own resources",
      });
    }

    next();
  };
};
