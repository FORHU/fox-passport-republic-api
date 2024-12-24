import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import { ACCESS_TOKEN_SECRET } from "../config";
import { AdminMemberRoles } from "../models/admin-members.model";
import AdminMemberSvc from "../services/admin-members.service";

const rolesMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  try {
    const user: any = jwt.verify(token, ACCESS_TOKEN_SECRET);

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return res.status(403).json({ message: "Access forbidden: Insufficient role" });
    }

    const adminMember = await AdminMemberSvc.getAdminMember({ invited_user: new ObjectId(user?._id) });

    if (!adminMember) {
      return res.status(403).json({ message: "Access forbidden: Admin member not found" });
    }

    const role = adminMember?.assigned_roles;

    req["venues"] = [AdminMemberRoles.ADMIN, AdminMemberRoles.MEMBER, AdminMemberRoles.SUPER_ADMIN, AdminMemberRoles.SALES].includes(role)
      ? "ALL"
      : adminMember.venues || [];
    req["admin_role"] = role;

    req.user = user;
    next();
  } catch (error) {
    console.log(error);
    return res.status(403).json({ message: "Invalid token" });
  }
};

export default rolesMiddleware;
