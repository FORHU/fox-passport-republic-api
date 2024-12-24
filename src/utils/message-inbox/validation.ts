import { customJoi as Joi } from "../customJoi";

export const validateGetMessages = (data: any) => {
  const schema = Joi.object({
    page: Joi.number(),
    limit: Joi.number(),
    id: Joi.string().escapeHTML().allow(null).optional(),
    inbox_id: Joi.string().escapeHTML().allow(null).optional(),
    room_id: Joi.string().escapeHTML().allow(null).optional(),
  });

  return schema.validate(data);
};
