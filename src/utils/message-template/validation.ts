import { customJoi as Joi } from "../customJoi";

export const validateCreateMessageTemplate = (data: any) => {
  const schema = Joi.object({
    message: Joi.string().escapeHTML()
      .allow("")
      .optional()
      .regex(/[\s\S]*/),
    message_title: Joi.string().escapeHTML()
      .allow("")
      .optional()
      .regex(/[\s\S]*/),
    space_id: Joi.string().escapeHTML().required(),
    attachments: Joi.array().items(Joi.string().escapeHTML()).optional().allow(null),
  });

  return schema.validate(data);
};

export const validateGetMessageTemplate = (data: any) => {
  const schema = Joi.object({
    _id: Joi.string().escapeHTML().optional().allow(null),
    space_id: Joi.string().escapeHTML().optional().allow(null),
  });

  return schema.validate(data);
};

export const validateUpdateMessageTemplate = (data: any) => {
  const schema = Joi.object({
    message: Joi.string().escapeHTML()
      .allow("")
      .optional()
      .regex(/[\s\S]*/),
    message_title: Joi.string().escapeHTML()
      .allow("")
      .optional()
      .regex(/[\s\S]*/),
    attachments: Joi.array().items(Joi.string().escapeHTML()).optional().allow(null),
  });

  return schema.validate(data);
};

export const validateDeleteMessageTemplate = (data: any) => {
  const schema = Joi.object({
    _id: Joi.string().escapeHTML().required(),
  });

  return schema.validate(data);
};
