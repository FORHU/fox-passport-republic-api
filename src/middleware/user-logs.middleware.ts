/* eslint-disable indent */
import { NextFunction, Request, Response } from "express";
import { ObjectId } from "mongodb";

import { actions_enums } from "../models/user-logs.model";
import UserLogsSvc from "../services/user-logs.service";

const userLogsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req?.user) {
      next();
      return;
    }
    // add query ids
    const space_id = req?.query?.space_id as string;
    const venue_id = req?.query?.venue_id as string;

    const method: string = req["method"];

    // condition for getting routes url
    const isSpaceUrl = req.url.includes("space");
    const isVenueUrl = req.url.includes("venue");

    // add specific methods per user case
    let action: any = "";
    switch (method) {
      case "GET":
        if (isSpaceUrl) {
          action = actions_enums.VIEW_SPACE;
        } else if (isVenueUrl) {
          action = actions_enums.VIEW_VENUE;
        }
        break;
      case "POST":
        if (isSpaceUrl) {
          action = actions_enums.CREATE_SPACE;
        } else if (isVenueUrl) {
          action = actions_enums.VIEW_VENUE;
        }
        break;
      case "PATCH":
        if (isSpaceUrl) {
          action = actions_enums.UPDATE_SPACE;
        } else if (isVenueUrl) {
          action = actions_enums.UPDATE_VENUE;
        }
        break;
    }

    //add details for specific routes
    const details = {
      ...(action === actions_enums.VIEW_SPACE ? { space: new ObjectId(space_id) } : {}),
      ...(action === actions_enums.UPDATE_SPACE ? { space: new ObjectId(req?.params?.id) } : {}),
      ...(action === actions_enums.VIEW_VENUE ? { venue: new ObjectId(venue_id) } : {}),
      ...(action === actions_enums.UPDATE_VENUE ? { venue: new ObjectId(req?.params?.id) } : {}),
    };

    const query = {
      user: new ObjectId(req.user._id),
      details,
      action,
    };

    const existingLogs = await UserLogsSvc.getUser(query);

    const count = existingLogs?.count || 0;

    await UserLogsSvc.updateUserlogs(query, { count: count + 1, updatedAt: new Date(), action });

    next();
  } catch (error: any) {
    next();
    return;
  }
};

export default userLogsMiddleware;
