import { customJoi as Joi } from "../customJoi";

export const validateCreateRatingSchema = (data: any) => {
  const schema = Joi.object({
    rating: Joi.number().required(),
    publicNote: Joi.string().escapeHTML().optional().allow(null, ""),
    privateNote: Joi.string().escapeHTML().optional().allow(null, ""),
  });
  return schema.validate(data);
};
