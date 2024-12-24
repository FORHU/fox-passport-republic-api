import { RequestStatus, RequestType } from "../../models/requests.model";
import { customJoi as Joi } from "../customJoi";

export const validateUpdateUserSchema = (data: any) => {
  const schema = Joi.object({
    first_name: Joi.string().escapeHTML().optional(),
    email: Joi.string().escapeHTML().email().optional(),
    last_name: Joi.string().escapeHTML().optional(),
    profile_picture: Joi.string().escapeHTML().optional(),
    company_name: Joi.string().escapeHTML().optional(),
    phone_number: Joi.string().escapeHTML().optional(),
    venue_name: Joi.string().escapeHTML().optional(),
    country: Joi.string().escapeHTML().optional(),
    date_of_birth: Joi.string().escapeHTML().optional(),
    zip_code: Joi.string().escapeHTML().optional(),
    role: Joi.string().escapeHTML().valid("ADMIN", "VENUE_OWNER", "USER").optional(),
    username: Joi.string().escapeHTML().optional(),
  });

  return schema.validate(data);
};

export const validateDeleteUserSchema = (data: any) => {
  const schema = Joi.object({
    description: Joi.string().escapeHTML().optional(),
    type: Joi.string()
      .valid(...Object.values(RequestType))
      .escapeHTML()
      .optional(),
    status: Joi.string()
      .valid(...Object.values(RequestStatus))
      .escapeHTML()
      .optional(),
  });

  return schema.validate(data);
};
