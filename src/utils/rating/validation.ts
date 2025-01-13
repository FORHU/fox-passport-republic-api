import { status_rating } from "../../models/rating.model";
import { customJoi as Joi } from "../customJoi";

export const validateCreateRatingSchema = (data: any) => {
  const schema = Joi.object({
    rating: Joi.number().required(),
    publicNote: Joi.string().escapeHTML().optional().allow(null, ""),
    privateNote: Joi.string().escapeHTML().optional().allow(null, ""),
  });
  return schema.validate(data);
};

export const validateUpdateRatingSchema = (data: any) => {
  const schema = Joi.object({
    rating: Joi.number().optional(),
    publicNote: Joi.string().escapeHTML().optional().allow(null, ""),
    privateNote: Joi.string().escapeHTML().optional().allow(null, ""),
    status: Joi.string()
      .escapeHTML()
      .valid(...Object.values(status_rating))
      .optional(),
  });
  return schema.validate(data);
};
