import { NextFunction, Request, Response } from "express";
import { ObjectId } from "mongodb";

import { OrgRoles, StatusType } from "../models/organization-member.model";
import OrganizationMemberSvc from "../services/organization-member.service";

const teamRolesOrganizationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const { _id: userId, role } = req?.user || {};
  req["venues"] = {};

  if (!userId) return next();

  const orgMember = await OrganizationMemberSvc.getOrganizationMemberById(new ObjectId(userId));

  if (!["VENUE_LISTER", "VENUE_OWNER"].includes(role)) return next();

  if (!orgMember) return res.json({ message: "Your are not part of any organization" });
  if (orgMember.status !== StatusType.ACCEPTED) return res.json({ message: "User is inactive or deleted" });

  req["roles"] = orgMember.assigned_roles;

  if (role === "VENUE_LISTER") {
    // Assign all venues if the user is an ADMIN, otherwise assign individual venues or organization
    req["venues"] = orgMember?.assigned_roles.some((role: OrgRoles) => [OrgRoles.VENUE_OWNER].includes(role))
      ? { organization: orgMember.organization }
      : orgMember.all_venues
        ? { organization: orgMember.organization }
        : orgMember.venues;
  } else if (role === "VENUE_OWNER") {
    // VENUE_OWNER always has access to the organization
    req["venues"] = { organization: orgMember.organization };
  }

  next();
};

export default teamRolesOrganizationMiddleware;
