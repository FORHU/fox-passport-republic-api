import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { ACCESS_TOKEN_SECRET } from "../config";
import AuthSvc from "../services/auth.service";

const authenticateTokenAndStatus = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  try {
    const user: any = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const device_id = user?.device_id;
    // Check if user exists and status is active
    const userData = await AuthSvc.getAuthUsers({ device_id });
    if (!userData || userData.status !== "ACTIVE") {
      return res.status(401).json({ message: "User not found or status is inactive" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default authenticateTokenAndStatus;
