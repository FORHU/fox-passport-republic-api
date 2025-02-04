import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import AuthSvc from "../../services/service-v2/auth.service";
import { generateHash } from "../../utils/auth";
import { validateLoginSchema, validateRegistrationSchema } from "../../utils/auth/validation";
import { MESSAGE_CODE } from "../../utils/constant";
import { handleErrorResponse } from "../../utils/reponse";
import { getUAResult } from "../../utils/ua-parser.util";

export default class AuthCtrlV2 {
  static async registrationViaEmail(req: Request, res: Response) {
    try {
      const { error } = validateRegistrationSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, {
          code: "ERROR_REGISTRATION_MISSING_FIELDS",
        });
      }

      const userAgentString = req.headers["user-agent"];
      const uaResult = getUAResult(userAgentString);

      const device_payload = {
        device_id: generateHash(),
        device: uaResult.device.type || "desktop",
        operating_system: uaResult.os.name,
        browser: uaResult.browser.name,
      };

      const response = await AuthSvc.registration(req.body, device_payload);

      return res.status(200).json(response);
    } catch (err) {
      console.error("Error during registration:", err);
      return handleErrorResponse(res, err, {
        code: "ERROR_REGISTRATION_VIA_EMAIL",
      });
    }
  }

  static async loginViaEmail(req: Request, res: Response) {
    const { email, password, role } = req.body;
    const { error } = validateLoginSchema(req.body);

    if (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_LOGIN_VIA_EMAIL",
        status_code: 400,
      });
    }

    try {
      const userAgentString = req.headers["user-agent"];
      const uaResult = getUAResult(userAgentString);

      const device_payload = {
        device_id: generateHash(),
        device: uaResult.device.type || "desktop",
        operating_system: uaResult.os.name,
        browser: uaResult.browser.name,
      };

      const result = await AuthSvc.login(email, password, role, device_payload);
      return res.status(200).json(result);
    } catch (error) {
      if (typeof error === "string" && MESSAGE_CODE[error as keyof typeof MESSAGE_CODE]) {
        return handleErrorResponse(
          res,
          error,
          {
            code: error,
            status_code: 404,
          },
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].status_code,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].message,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].description,
        );
      }
      return handleErrorResponse(res, error, {
        code: "ERROR_LOGIN_VIA_EMAIL",
      });
    }
  }

  static async switchUserRoles(req: Request, res: Response) {
    try {
      const user_id = new ObjectId(req?.user?._id);

      await AuthSvc.switchUserRoles(user_id, req.body);

      return res.status(401).json();
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_SWITCH_USER_ROLES",
      });
    }
  }
}
