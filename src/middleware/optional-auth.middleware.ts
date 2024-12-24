import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import { ACCESS_TOKEN_SECRET } from "../config";
import AuthSvc from "../services/auth.service";

const authenticateTokenAndStatus = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const user: any = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const userId = user._id;

    // Check if user exists and status is active
    const userData = await AuthSvc.getAuthUsers({ user: new ObjectId(userId) });
    if (!userData || userData.status !== "ACTIVE") {
      return res.status(403).json({ message: "User not found or status is inactive" });
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === "JsonWebTokenError") {
      return next();
    } else {
      return res.status(403).json({ message: "Invalid token" });
    }
  }
};

export default authenticateTokenAndStatus;
