import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { Socket } from "socket.io";

import { ACCESS_TOKEN_SECRET } from "../config";
import AuthSvc from "../services/auth.service";
import { TENANT_CONFIGS, TENANT_MAPPING } from "../utils/constant";

interface AuthenticatedSocket extends Socket {
  user?: any;
  tenant?: any;
}

// eslint-disable-next-line no-unused-vars
const authenticateSocket = async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  const authHeader = socket.handshake.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  const tenantHeader: string = (socket.handshake.headers["x-tenant"] as string) || (socket.handshake.headers["tenant"] as string);
  const apiKey: string | undefined = socket.handshake.headers["x-api-key"] as string;
  const referer = socket.handshake.headers["referer"];

  if (!token) {
    return next(new Error("Authentication token is required."));
  }

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
      return next(new Error("Invalid referer format."));
    }
  }

  try {
    const user: any = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const userId = user._id;

    const userData = await AuthSvc.getAuthUsers({ user: new ObjectId(userId as string) });
    if (!userData || userData.status !== "ACTIVE") {
      return next(new Error("User not found or status is inactive"));
    }

    const country = Object.keys(TENANT_MAPPING).find((key) => refererHostname.includes(key));
    const expectedTenant = country ? TENANT_MAPPING[country] : null;
    const tenantConfig = tenantHeader ? TENANT_CONFIGS[tenantHeader] : null;

    if (tenantConfig) {
      // ✅ Allow if valid API key is provided
      if (apiKey && tenantConfig.X_API_KEYS?.includes(apiKey)) {
        socket.tenant = {
          code: tenantHeader,
          config: tenantConfig,
          referer: refererHostname,
          country: country,
          apiKeyUsed: true,
        };
        socket.user = user;
        return next();
      }

      // 🛑 Require referer if no valid API key is provided
      if (tenantConfig.require_referer && !referer) {
        return next(new Error("Referer header or valid API key is required."));
      }

      // 🔄 Check if referer domain is allowed
      if (refererHostname) {
        const isAllowedDomain = tenantConfig.allowed_domains.some((domain: string) => refererHostname.includes(domain));
        if (!isAllowedDomain) {
          return next(new Error(`Domain not allowed for this tenant ${refererHostname}`));
        }
      }

      // 🔄 Check if referer matches expected tenant
      if (expectedTenant && expectedTenant !== tenantHeader) {
        return next(new Error(`Tenant mismatch with referer`));
      }

      socket.user = user;
      socket.tenant = {
        code: tenantHeader,
        config: tenantConfig,
        referer: refererHostname,
        country: country,
        apiKeyUsed: false,
      };
      return next();
    } else if (tenantHeader) {
      return next(new Error(`Invalid tenant`));
    }
  } catch (error) {
    return next(new Error("Invalid token"));
  }
};

export default authenticateSocket;
