import { NextFunction, Request, Response } from "express";

import { TENANT_CONFIGS, TENANT_MAPPING } from "../utils/constant";

const TenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tenantHeader: string = (req.headers["x-tenant"] as string) || (req.headers["tenant"] as string);
  const referer = req.headers.referer;

  let refererHostname = "";
  if (referer) {
    try {
      if (referer.includes("://")) {
        const url = new URL(referer);
        refererHostname = url.host;
      } else {
        refererHostname = referer.split("/")[0];
      }
    } catch (error) {
      return res.status(400).json({
        error: "Invalid referer format",
      });
    }
  }

  const country = Object.keys(TENANT_MAPPING).find((key) => refererHostname.includes(key));

  // Get expected tenant code from mapping
  const expectedTenant = country ? TENANT_MAPPING[country] : null;

  // Get tenant configuration
  const tenantConfig = tenantHeader ? TENANT_CONFIGS[tenantHeader] : null;

  // Validation checks
  if (tenantConfig) {
    // 1. Check if referer is required
    if (tenantConfig.require_referer && !referer) {
      return res.status(400).json({
        error: "Referer header is required",
      });
    }

    // 2. Check if domain is allowed
    if (refererHostname) {
      const isAllowedDomain = tenantConfig.allowed_domains.some((domain: string) => refererHostname.includes(domain));
      if (!isAllowedDomain) {
        return res.status(403).json({
          error: "Domain not allowed for this tenant",
          referer: refererHostname,
        });
      }
    }

    // 3. Check if tenant matches the expected tenant from referer
    if (expectedTenant && expectedTenant !== tenantHeader) {
      return res.status(403).json({
        error: "Tenant mismatch with referer",
      });
    }
    req.tenant = {
      code: tenantHeader,
      config: tenantConfig,
      referer: refererHostname,
      country: country,
    };
  } else if (tenantHeader) {
    // Tenant header provided but no config found
    return res.status(400).json({
      error: "Invalid tenant",
    });
  }

  next();
};

export default TenantMiddleware;
