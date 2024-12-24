import { NextFunction, Request, Response } from "express";

import { OrgRoles } from "../models/organization-member.model";

const teamRolesOrganizationPermissionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const { role } = req?.user || {};

  const RESTRICT_METHODS = ["POST", "PATCH", "DELETE"];

  if (!["VENUE_LISTER", "VENUE_OWNER"].includes(role)) return next();

  if (role === "VENUE_OWNER") return next();

  const teamMembeRoles = req["roles"];

  if (RESTRICT_METHODS.includes(req["method"])) {
    const allowedAccess = teamMembeRoles.some((role: OrgRoles) => [OrgRoles.VENUE_OWNER, OrgRoles.ADMIN].includes(role));
    if (allowedAccess) return next();
    return res.status(403).json({ message: "You are not authorized to perform this action" });
  }

  next();
};

export default teamRolesOrganizationPermissionMiddleware;
