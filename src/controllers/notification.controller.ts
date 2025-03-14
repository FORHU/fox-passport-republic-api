import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import NotificationSvc from "../services/notification.service";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class NotificationCtrl {
  static async getUnreadNotificationsCount(req: Request, res: Response) {
    try {
      const user = req.user;
      const query = { receiver: new ObjectId(user._id), read: false };
      const result = await NotificationSvc.getUnreadNotificationsCount(query);
      return handleResponse(res, result, { code: "NOTIFICATION_COUNT_FETCHED_SUCCESSFULLY" });
    } catch (error) {
      return handleErrorResponse(res, error, { code: "NOTIFICATION_COUNT_FETCH_FAILED" });
    }
  }
}
