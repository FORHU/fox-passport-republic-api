import { NextFunction, Request, Response } from "express";
import { ObjectId } from "mongodb";

import AdminMemberSvc from "../services/admin-members.service";
import OrganizationMemberSvc from "../services/organization-member.service";
import UserSvc from "../services/user.service";

const checkSuspension = async (suspensionTime: string, res: Response) => {
  const currentDate = new Date();

  if (suspensionTime === "UNTIL_UNSUSPENDED") {
    return res.status(403).json({ message: "User is suspended until further notice" });
  }

  if (currentDate < new Date(suspensionTime)) {
    return res.status(403).json({ message: "User is currently suspended" });
  }

  return null;
};

const handleSuspension = async (userId: ObjectId, role: string, res: Response, next: NextFunction) => {
  const query = {
    status: "ACCEPTED",
    ...(role === "ADMIN" ? { invited_user: userId } : { invited_user_id: userId }),
  };

  const [associatedMembers] =
    role === "ADMIN" ? await AdminMemberSvc.getAllAdminMembers(query) : await OrganizationMemberSvc.getAllOrganizationMembers(query);

  if (!associatedMembers) return next();

  const suspensionResponse = await checkSuspension(associatedMembers.suspension_time, res);
  if (suspensionResponse) return suspensionResponse;

  if (role === "ADMIN") {
    await AdminMemberSvc.updateAdminMemberById(associatedMembers._id, { suspension_time: null });
  } else {
    await OrganizationMemberSvc.updateOrganizationMembers(associatedMembers._id, { suspension_time: null });
  }

  next();
};

const suspensionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const { email, role } = req.body || {};

  if (!email || !role) {
    return res.status(400).json({ message: "Email and role are required" });
  }

  try {
    const userDetails = await UserSvc.getUser({ email: { $regex: new RegExp(`^${email}$`, "i") }, deletedAt: null });

    if (!userDetails) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!["VENUE_LISTER", "VENUE_OWNER", "ADMIN"].includes(role)) {
      return next();
    }

    await handleSuspension(userDetails._id, role, res, next);
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default suspensionMiddleware;
