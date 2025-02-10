import { NextFunction, Request, Response } from "express";

import UserSvc from "../services/user.service";

const TenantValidationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.tenant) return next();

  const tenantCode = req.tenant.code;

  const email = req.user ? req.user.email.toLowerCase() : req.body.email.toLowerCase();

  const query = { email };

  // const query = req.user ? { email: req.user.email, tenant: tenantCode } : { email: req.body.email, tenant: tenantCode };

  const user = await UserSvc.getUser(query);
  if (!user) {
    return res.status(404).json({
      error: "User not found",
      message: "Account not found or has been deleted. Please contact support if you think this is an error"
    });
  }

  if (user.tenant !== tenantCode) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Access denied. You do not have permission to access this user because they belong to a different tenant.",
    });
  }

  next();
};

export default TenantValidationMiddleware;
