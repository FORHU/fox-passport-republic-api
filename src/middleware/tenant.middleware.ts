import { NextFunction, Request, Response } from "express";

import { TENANT_CONFIGS, TENANT_MAPPING } from "../utils/constant";

const TenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tenantHeader: string = (req.headers["x-tenant"] as string) || (req.headers["tenant"] as string);
  const apiKey: string | undefined = req.headers["x-api-key"] as string;
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
  const expectedTenant = country ? TENANT_MAPPING[country] : null;
  const tenantConfig = tenantHeader ? TENANT_CONFIGS[tenantHeader] : null;

  if (tenantConfig) {
    // ✅ Allow if valid API key is provided
    if (apiKey && tenantConfig.X_API_KEYS?.includes(apiKey)) {
      req.tenant = {
        code: tenantHeader,
        config: tenantConfig,
        referer: refererHostname,
        country: country,
        apiKeyUsed: true,
      };
      return next();
    }

    // 🛑 Require referer if no valid API key is provided
    if (tenantConfig.require_referer && !referer) {
      return res.status(400).json({
        error: "Referer header or valid API key is required",
      });
    }

    // 🔄 Check if referer domain is allowed
    if (refererHostname) {
      const isAllowedDomain = tenantConfig.allowed_domains.some((domain: string) =>
        refererHostname.includes(domain)
      );
      if (!isAllowedDomain) {
        return res.status(403).json({
          error: "Domain not allowed for this tenant",
          referer: refererHostname,
        });
      }
    }

    // 🔄 Check if referer matches expected tenant
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
      apiKeyUsed: false,
    };
  } else if (tenantHeader) {
    return res.status(400).json({
      error: "Invalid tenant",
    });
  }

  next();
};

export default TenantMiddleware;
