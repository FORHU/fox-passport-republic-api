import { NextFunction, Request, Response } from "express";

import UserSvc from "../services/user.service";

const TenantValidationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.tenant) return next();

  const tenantCode = req.tenant.code;

  const user = await UserSvc.getUser({ email: req.body.email, tenant: tenantCode });

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Access denied. You do not have permission to access this user because they belong to a different tenant."
    });
  }

  next();
};

export default TenantValidationMiddleware;
