import crypto from "crypto";
import jwt from "jsonwebtoken";

import { ACCESS_TOKEN_EXPIRES, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_EXPIRES, REFRESH_TOKEN_SECRET } from "../config";

export const generateAccessToken = (payload: any): string => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET as string, { expiresIn: ACCESS_TOKEN_EXPIRES as any });
};

export const generateRefreshToken = (payload: any): string => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET as string, { expiresIn: REFRESH_TOKEN_EXPIRES as any });
};

export const generateVerificationToken = (payload: any, expiresIn: any = "1d"): string => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET as string, { expiresIn });
};

export const verifyToken = (token: string, accessToken = ACCESS_TOKEN_SECRET): any => {
  try {
    return jwt.verify(token, accessToken);
  } catch (error) {
    return null;
  }
};

export const generateHash = () => {
  return crypto.randomBytes(16).toString("hex");
};
