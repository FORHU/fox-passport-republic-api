import { Request, Response } from "express";
import Joi from "joi";
import { sendServerError } from "../../utils/errors";
import { VALIDATE_ALL, sendValidationError } from "../../utils/validation";
import RewardSettingsSvc from "./reward-settings.service";

const actorOf = (req: Request) => ({
  userId: req.user!.userId,
  email: req.user!.email,
});

// The value's own rule (whole number, its range) is checked by the service
// against the setting it names; here it only has to be present.
const SET_BODY_SCHEMA = Joi.object({
  value: Joi.any().required(),
});

export default class RewardSettingsCtrl {
  static async list(_req: Request, res: Response) {
    try {
      const data = await RewardSettingsSvc.list();
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  static async set(req: Request, res: Response) {
    try {
      const { error, value } = SET_BODY_SCHEMA.validate(req.body, VALIDATE_ALL);
      if (error) return sendValidationError(res, error, { success: true });

      const data = await RewardSettingsSvc.set(
        String(req.params.key),
        value.value,
        actorOf(req),
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  static async reset(req: Request, res: Response) {
    try {
      const data = await RewardSettingsSvc.reset(
        String(req.params.key),
        actorOf(req),
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  static async history(req: Request, res: Response) {
    try {
      const data = await RewardSettingsSvc.history(String(req.params.key));
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }
}
