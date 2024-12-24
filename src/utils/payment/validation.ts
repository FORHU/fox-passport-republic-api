import { customJoi as Joi } from "../customJoi";

export const validateCreatePaymentSchema = (data: any) => {
  const schema = Joi.object({
    enquiry_id: Joi.string().escapeHTML().required(),
  });

  return schema.validate(data);
};

export const validateComputePaymentSchema = (data: any) => {
  const schema = Joi.object({
    space_id: Joi.string().escapeHTML().required(),
    date: Joi.string().escapeHTML().required(),
    time_start: Joi.string().escapeHTML().required(),
    time_end: Joi.string().escapeHTML().required(),
    guests: Joi.number().required(),
  });

  return schema.validate(data);
};
