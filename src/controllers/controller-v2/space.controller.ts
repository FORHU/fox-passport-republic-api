import { Request, Response } from "express";

import SpaceSvcV2 from "../../services/service-v2/space.service";
import { handleErrorResponse, handleResponse } from "../../utils/reponse-V2";
import { validateGetSpacesSchema } from "../../utils/space/validation";

export default class SpaceCtrl {
  static async getSpaces(req: Request, res: Response) {
    const { error } = validateGetSpacesSchema(req.query);
    if (error) return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });

    if (req?.tenant) {
      req.query.tenant_code = req?.tenant?.code;
    }

    if (req?.user) {
      req.query.user = req?.user;
    }

    const results = await SpaceSvcV2.handleGetSpaces(req?.query);

    return handleResponse(res, results, "GET_SPACES");
  }

  static async getSpace(req: Request, res: Response) {
    const spaceId = req.params.id;
    const results = await SpaceSvcV2.handleGetSpace(spaceId);
    return handleResponse(res, results, "GET_SPACES");
  }

  static async getMostPopularSpaces(req: Request, res: Response) {
    const { limit = 12, page = 1, location = "SG", status } = req.query;
    const user_id = req?.user?._id;
    const { error } = validateGetSpacesSchema({
      limit,
      page,
      status,
    });

    if (error) return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });

    try {
      const payload = {
        limit: parseInt(limit as string),
        page: parseInt(page as string),
        country: location as string,
        status: status as string,
        ...(user_id && { user_id }),
        ...(req.tenant && { tenant: req.tenant }),
        ...(req.tenant.code && { tenant_code: req.tenant.code }),
      };
      const results = await SpaceSvcV2.handleGetMostPopularSpaces(payload);
      return handleResponse(res, results, "MOST_POPULAR_SPACES");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "GET_MOST_POPULAR_SPACES_FAILED" });
    }
  }
}
