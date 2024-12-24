import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { ACCESS_TOKEN_SECRET } from "../config";

const sessionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers["authorization"];
  const token = authorization && authorization.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, ACCESS_TOKEN_SECRET as string, (err: any, user: any) => {
    if (err) return res.status(401).json({ message: "Authorization token expired" });
    req.user = user;
    next();
  });
};

export default sessionMiddleware;
