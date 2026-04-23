import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../config";

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
export const authenticate = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "No token provided",
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as any;

        // Attach user to request
        req.user = {
            userId: decoded.userId,
            systemRole: decoded.systemRole || "user",
            roleType: decoded.roleType || [],
            email: decoded.email,
            // Keep role for backward compatibility if needed, mapping to systemRole
            role: decoded.systemRole || decoded.role || "user",
        };

        next();
    } catch (error: any) {
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
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as any;

            req.user = {
                userId: decoded.userId,
                systemRole: decoded.systemRole || "user",
                roleType: decoded.roleType || [],
                email: decoded.email,
                role: decoded.systemRole || decoded.role || "user",
            };
        }

        next();
    } catch (error) {
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
export const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const userSystemRole = req.user.systemRole;
        const userRoleTypes = req.user.roleType;

        // Check if user has required SystemRole or any required RoleType
        const hasSystemRole = allowedRoles.includes(userSystemRole);
        const hasRoleType = allowedRoles.some(role => userRoleTypes.includes(role as any));

        if (!hasSystemRole && !hasRoleType) {
            return res.status(403).json({
                success: false,
                message: "Insufficient permissions",
                requiredRoles: allowedRoles,
                userSystemRole,
                userRoleTypes,
            });
        }

        next();
    };
};


/**
 * Check if user is admin or super_admin
 */
export const requireAdmin = requireRole(["admin", "super_admin", "mayor"]);

/**
 * Check if user is super_admin only
 */
export const requireSuperAdmin = requireRole(["super_admin", "mayor"]);

/**
 * Check if user is host, admin, or super_admin
 */
export const requireHost = requireRole(["host", "admin", "super_admin", "mayor"]);

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
    getUserIdFromRequest: (req: Request) => string
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
        const isAdmin = ["admin", "super_admin", "mayor"].includes(req.user.role);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "You can only access your own resources",
            });
        }

        next();
    };
};
