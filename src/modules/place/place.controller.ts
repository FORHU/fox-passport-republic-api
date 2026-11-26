import { Request, Response } from "express";
import Joi from "joi";
import PlaceSvc from "./place.service";
import { AppError, sendAppError } from "../../utils/errors";

/** Sends a service error as its status, anything else as a 500. */
function fail(res: Response, e: unknown) {
  if (e instanceof AppError) return sendAppError(res, e);
  console.error(e);
  return res
    .status(500)
    .json({ success: false, message: "Something went wrong" });
}

const fields = {
  name: Joi.string().trim().min(1).max(120),
  addressLine: Joi.string().trim().min(1).max(300),
  city: Joi.string().trim().min(1).max(100),
  state: Joi.string().trim().max(100).allow("", null),
  country: Joi.string().trim().max(100).allow(""),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  notes: Joi.string().trim().max(500).allow("", null),
};

const createSchema = Joi.object({
  ...fields,
  name: fields.name.required(),
  addressLine: fields.addressLine.required(),
  city: fields.city.required(),
  lat: fields.lat.required(),
  lng: fields.lng.required(),
});

const updateSchema = Joi.object(fields).min(1);

/** Places (epic #517, api#518 and api#519). */
export default class PlaceCtrl {
  static async create(req: Request, res: Response) {
    const { error, value } = createSchema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });
    try {
      const data = await PlaceSvc.create(req.user!.userId, value);
      return res.status(201).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async listMine(req: Request, res: Response) {
    try {
      const data = await PlaceSvc.listMine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async getForEvent(req: Request, res: Response) {
    try {
      const data = await PlaceSvc.getForEvent(req.user!, req.params.eventId);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const data = await PlaceSvc.get(req.user!, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async update(req: Request, res: Response) {
    const { error, value } = updateSchema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });
    try {
      const data = await PlaceSvc.update(
        req.user!.userId,
        req.params.id,
        value,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async archive(req: Request, res: Response) {
    try {
      const data = await PlaceSvc.archive(req.user!.userId, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }
}
