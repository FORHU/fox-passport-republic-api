import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../config";
import { toAuthenticatedUser } from "../types/auth";
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
 * `requirePermission`'s sibling for a route two different capabilities can
 * satisfy — e.g. `service.routes.ts`'s create/update/delete, which
 * `service:manage` (serviceFoxer) or `performer:manage` (performerFoxer) both
 * unlock, since both own rows of the same `Service` model. Kept separate from
 * `requirePermission` rather than adding a second overload, so its ~15
 * existing single-permission call sites are untouched.
 */
export const requirePermissionAny = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
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
};
